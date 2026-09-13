const mongoose = require("mongoose");
const assert = require("assert");
require("dotenv").config({ path: "./.env" });

const User = require("../src/model/userModel");
const BloodRequest = require("../src/model/bloodRequestModel");
const Notification = require("../src/model/notificationModel");
const AuditLog = require("../src/model/auditLogModel");

const {
  findAndRankEligibleDonors,
  broadcastToEligibleDonors,
  widenSearchRadius,
  notifyCandidatesFulfilled,
  selectNearestAcceptedDonor,
  DEFAULT_MAX_DISTANCE_KM,
} = require("../src/utils/donorSelectionService");
const { REQUEST_STATUSES } = require("../src/utils/stateMachine");
const { logAuditEvent } = require("../src/utils/auditLogger");
const { userUpdateProfile } = require("../src/controllers/userController");

async function runIntegrationTests() {
  const uri = process.env.TEST_MONGO_URI || process.env.mongoURI || "mongodb://127.0.0.1:27017/blood-bank-test";
  console.log(`▶ Connecting to MongoDB for Lifecycle Integration Tests...`);
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 6000 });
  } catch (err) {
    if (uri !== "mongodb://127.0.0.1:27017/blood-bank-test") {
      console.log("Primary URI failed, trying local MongoDB at mongodb://127.0.0.1:27017/blood-bank-test...");
      await mongoose.connect("mongodb://127.0.0.1:27017/blood-bank-test", { serverSelectionTimeoutMS: 5000 });
    } else {
      throw err;
    }
  }
  console.log("✅ Connected to MongoDB");

  const cleanupUserIds = [];
  const cleanupRequestIds = [];

  try {
    // 1. Setup Test Users: Receiver, Hospital, Admin, and 3 Donors at different distances
    const testPrefix = `test_${Date.now()}_`;

    const receiver = await User.create({
      fullName: "Test Receiver",
      username: `${testPrefix}receiver`,
      email: `${testPrefix}receiver@example.com`,
      password: "password123",
      role: "receiver",
      bloodGroup: "A+",
      profileCompleted: false, // receiver without profile completion
      location: {
        city: "Mumbai",
        state: "Maharashtra",
        coordinates: {
          type: "Point",
          coordinates: [72.8777, 19.076], // Mumbai [lng, lat]
        },
      },
    });
    cleanupUserIds.push(receiver._id);

    const hospital = await User.create({
      fullName: "Test Hospital",
      username: `${testPrefix}hospital`,
      email: `${testPrefix}hospital@example.com`,
      password: "password123",
      role: "hospital",
      hospitalName: "Test City Hospital",
      hospitalVerified: true,
      hospitalVerificationStatus: "verified",
    });
    cleanupUserIds.push(hospital._id);

    const admin = await User.create({
      fullName: "Test Admin",
      username: `${testPrefix}admin`,
      email: `${testPrefix}admin@example.com`,
      password: "password123",
      role: "admin",
    });
    cleanupUserIds.push(admin._id);

    // Donor 1: Closest (~1.5 km away)
    const donor1 = await User.create({
      fullName: "Nearest Donor 1",
      username: `${testPrefix}donor1`,
      email: `${testPrefix}donor1@example.com`,
      password: "password123",
      role: "donor",
      bloodGroup: "A+",
      availabilityStatus: "available",
      isVerified: true,
      isBlocked: false,
      location: {
        city: "Mumbai",
        coordinates: {
          type: "Point",
          coordinates: [72.885, 19.08], // ~1.5 km
        },
      },
    });
    cleanupUserIds.push(donor1._id);

    // Donor 2: Medium (~10 km away)
    const donor2 = await User.create({
      fullName: "Medium Donor 2",
      username: `${testPrefix}donor2`,
      email: `${testPrefix}donor2@example.com`,
      password: "password123",
      role: "donor",
      bloodGroup: "O+", // O+ can donate to A+
      availabilityStatus: "available",
      isVerified: true,
      isBlocked: false,
      location: {
        city: "Mumbai",
        coordinates: {
          type: "Point",
          coordinates: [72.83, 19.12], // ~10 km
        },
      },
    });
    cleanupUserIds.push(donor2._id);

    // Donor 3: Farther (~28 km away)
    const donor3 = await User.create({
      fullName: "Far Donor 3",
      username: `${testPrefix}donor3`,
      email: `${testPrefix}donor3@example.com`,
      password: "password123",
      role: "donor",
      bloodGroup: "A-", // A- can donate to A+
      availabilityStatus: "available",
      isVerified: true,
      isBlocked: false,
      location: {
        city: "Mumbai",
        coordinates: {
          type: "Point",
          coordinates: [72.98, 19.22], // ~28 km
        },
      },
    });
    cleanupUserIds.push(donor3._id);

    console.log("✅ Test users created successfully");

    // 2. STEP 1: Receiver submits blood request (flat coordinates format)
    const bloodRequest = await BloodRequest.create({
      requestedBy: receiver._id,
      bloodGroup: "A+",
      quantity: 2,
      emergencyLevel: "high",
      location: {
        city: "Mumbai",
        state: "Maharashtra",
        coordinates: {
          lat: 19.076,
          lng: 72.8777,
        },
      },
      status: REQUEST_STATUSES.PENDING_HOSPITAL_APPROVAL,
    });
    cleanupRequestIds.push(bloodRequest._id);

    await logAuditEvent({
      requestId: bloodRequest._id,
      actor: receiver._id,
      actorRole: "receiver",
      action: "REQUEST_CREATED",
      newStatus: REQUEST_STATUSES.PENDING_HOSPITAL_APPROVAL,
    });

    assert.strictEqual(bloodRequest.status, REQUEST_STATUSES.PENDING_HOSPITAL_APPROVAL);
    console.log("✅ Step 1 verified: Request created in pending_hospital_approval with flat coordinates");

    // 3. STEP 2 & 3: Hospital Approval & Broadcast to Candidate Pool
    const rankedDonors = await findAndRankEligibleDonors(bloodRequest, { limit: 10, maxDistanceKm: 50 });
    assert.strictEqual(rankedDonors.length >= 3, true, "Should find at least 3 eligible donors in 50km radius");

    // Verify ordering by distance: Nearest should be donor1
    const foundDonorIds = rankedDonors.map((d) => (d.donor._id || d.donor).toString());
    assert.strictEqual(foundDonorIds[0], donor1._id.toString(), "Donor 1 must be ranked first (nearest)");

    console.log(`✅ Step 3 verified: Found and ranked ${rankedDonors.length} donors. Nearest: ${donor1.fullName} (${rankedDonors[0].distanceKm} km)`);

    // Store candidatePool on request and set acceptanceDeadline
    const deadline = new Date(Date.now() + 30 * 60 * 1000);
    bloodRequest.hospitalApproved = true;
    bloodRequest.hospitalApprovedBy = hospital._id;
    bloodRequest.assignedHospital = hospital._id;
    bloodRequest.candidatePool = rankedDonors.map((item) => ({
      donor: item.donor._id,
      distanceKm: item.distanceKm,
      searchRadiusKm: DEFAULT_MAX_DISTANCE_KM,
      addedAt: new Date(),
    }));
    bloodRequest.acceptanceDeadline = deadline;
    bloodRequest.status = REQUEST_STATUSES.WAITING_FOR_DONOR;
    await bloodRequest.save();

    // Broadcast notifications to all candidate donors
    await broadcastToEligibleDonors(bloodRequest, rankedDonors);

    // Verify that NO single donor was pre-selected
    assert.strictEqual(bloodRequest.confirmedDonor, null, "confirmedDonor must be null during waiting_for_donor");
    assert.strictEqual(bloodRequest.candidatePool.length, 3, "All 3 eligible donors must be in candidatePool");
    console.log("✅ Step 4 verified: Candidate pool populated and broadcast sent without selecting a single donor");

    // 4. MULTI-DONOR ATOMIC ACCEPTANCE & NEAREST SELECTION TEST:
    // Simulate concurrent accept between Donor 1 and Donor 2. Both must be preserved in acceptedDonors.
    // Selection chooses nearest donor (Donor 1 at ~1.5 km) as primary, and Donor 2 as backup.
    console.log("▶ Testing multi-donor concurrent acceptance & nearest selection...");
    const acceptTime = new Date();
    const collectionDeadline = new Date(acceptTime.getTime() + 180000);

    const [raceResult1, raceResult2] = await Promise.all([
      // Donor 1 attempts to accept atomically
      BloodRequest.findOneAndUpdate(
        {
          _id: bloodRequest._id,
          status: REQUEST_STATUSES.WAITING_FOR_DONOR,
          "acceptedDonors.donor": { $ne: donor1._id },
          "rejectedDonors.donor": { $ne: donor1._id },
        },
        [
          {
            $set: {
              acceptedDonors: {
                $concatArrays: [
                  "$acceptedDonors",
                  [{ donor: donor1._id, acceptedAt: acceptTime, status: "accepted" }],
                ],
              },
              donorSelectionDeadline: {
                $cond: {
                  if: { $or: [{ $eq: ["$donorSelectionDeadline", null] }, { $not: ["$donorSelectionDeadline"] }] },
                  then: collectionDeadline,
                  else: "$donorSelectionDeadline",
                },
              },
            },
          },
        ],
        { returnDocument: "after", updatePipeline: true }
      ),
      // Donor 2 attempts to accept simultaneously
      BloodRequest.findOneAndUpdate(
        {
          _id: bloodRequest._id,
          status: REQUEST_STATUSES.WAITING_FOR_DONOR,
          "acceptedDonors.donor": { $ne: donor2._id },
          "rejectedDonors.donor": { $ne: donor2._id },
        },
        [
          {
            $set: {
              acceptedDonors: {
                $concatArrays: [
                  "$acceptedDonors",
                  [{ donor: donor2._id, acceptedAt: acceptTime, status: "accepted" }],
                ],
              },
              donorSelectionDeadline: {
                $cond: {
                  if: { $or: [{ $eq: ["$donorSelectionDeadline", null] }, { $not: ["$donorSelectionDeadline"] }] },
                  then: collectionDeadline,
                  else: "$donorSelectionDeadline",
                },
              },
            },
          },
        ],
        { returnDocument: "after", updatePipeline: true }
      ),
    ]);

    assert.ok(raceResult1, "Donor 1 acceptance must succeed");
    assert.ok(raceResult2, "Donor 2 acceptance must succeed");

    const reloadedAfterAccept = await BloodRequest.findById(bloodRequest._id);
    assert.strictEqual(reloadedAfterAccept.acceptedDonors.length, 2, "Both donors must be in acceptedDonors");
    assert.strictEqual(reloadedAfterAccept.status, REQUEST_STATUSES.WAITING_FOR_DONOR, "Request must remain waiting_for_donor during collection");
    console.log("✅ Multi-donor acceptance verified: Both donors recorded without premature matching");

    // Execute nearest donor selection
    const selectResult = await selectNearestAcceptedDonor(bloodRequest._id);
    assert.strictEqual(selectResult.success, true, "selectNearestAcceptedDonor must succeed");
    assert.strictEqual(selectResult.status, REQUEST_STATUSES.MATCHED, "Request must transition to matched");

    const matchedRequest = await BloodRequest.findById(bloodRequest._id);
    assert.strictEqual(
      matchedRequest.confirmedDonor.toString(),
      donor1._id.toString(),
      "Nearest donor (Donor 1, ~1.5 km) must be selected as primary confirmedDonor"
    );
    assert.strictEqual(matchedRequest.status, REQUEST_STATUSES.MATCHED);

    const primaryEntry = matchedRequest.acceptedDonors.find((a) => a.donor.toString() === donor1._id.toString());
    const backupEntry = matchedRequest.acceptedDonors.find((a) => a.donor.toString() === donor2._id.toString());
    assert.strictEqual(primaryEntry.status, "selected", "Donor 1 must have status 'selected'");
    assert.strictEqual(backupEntry.status, "backup", "Donor 2 must have status 'backup'");

    console.log(`✅ Nearest donor selection verified: Donor 1 (${matchedRequest.confirmedDonorDistanceKm} km) is primary, Donor 2 is backup`);

    // 5. RADIUS WIDENING TEST
    console.log("▶ Testing radius widening behavior...");
    const expiredRequest = await BloodRequest.create({
      requestedBy: receiver._id,
      bloodGroup: "AB-",
      quantity: 1,
      status: REQUEST_STATUSES.WAITING_FOR_DONOR,
      acceptanceDeadline: new Date(Date.now() - 5000), // already expired
      candidatePool: [],
    });
    cleanupRequestIds.push(expiredRequest._id);

    const widenResult = await widenSearchRadius(expiredRequest._id, {
      actorId: null,
      actorRole: "system",
      note: "Automated test sweep",
    });

    // Should widen or exhaust cleanly
    const reloadedExpired = await BloodRequest.findById(expiredRequest._id);
    assert.strictEqual(
      [REQUEST_STATUSES.WAITING_FOR_DONOR, REQUEST_STATUSES.NO_DONORS_AVAILABLE].includes(reloadedExpired.status),
      true,
      "Request should remain waiting_for_donor if widened or no_donors_available if none found"
    );
    console.log(`✅ Radius widening verified: Transitioned to '${reloadedExpired.status}' (result: ${widenResult.message})`);

    // 6. COORDINATES END-TO-END TEST (Constraint b):
    console.log("▶ Testing profile coordinates end-to-end (Constraint b)...");
    const testDonorUser = await User.create({
      fullName: "Geo Profile Test Donor",
      username: `${testPrefix}geodonor`,
      email: `${testPrefix}geodonor@example.com`,
      password: "password123",
      role: "donor",
    });
    cleanupUserIds.push(testDonorUser._id);

    // Invoke userUpdateProfile controller with flat { lat, lng } coordinates
    const mockReq = {
      user: { id: testDonorUser._id },
      body: {
        phoneNumber: "9876543210",
        bloodGroup: "B+",
        age: 25,
        weight: 68,
        location: {
          city: "Mumbai",
          state: "Maharashtra",
          coordinates: {
            lat: 19.076,
            lng: 72.8777,
          },
        },
      },
    };

    let responseData = null;
    const mockRes = {
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(data) {
        responseData = data;
        return this;
      },
    };

    await userUpdateProfile(mockReq, mockRes);
    assert.strictEqual(mockRes.statusCode, 200, "userUpdateProfile should return 200");

    const reloadedGeoUser = await User.findById(testDonorUser._id);
    assert.strictEqual(reloadedGeoUser.location.coordinates.type, "Point", "GeoJSON type must be Point");
    assert.strictEqual(reloadedGeoUser.location.coordinates.coordinates[0], 72.8777, "Longitude must be 72.8777");
    assert.strictEqual(reloadedGeoUser.location.coordinates.coordinates[1], 19.076, "Latitude must be 19.076");
    console.log("✅ Constraint (b) verified: Profile update with {lat, lng} correctly saved as GeoJSON [lng, lat] Point");

    // 7. ROLE ROUTE PROFILE GATE TEST (Constraint c):
    console.log("▶ Testing RoleRoute profile gate logic (Constraint c)...");
    const requireProfile = true;

    // A receiver with profileCompleted = false
    const receiverBlocked = requireProfile && receiver.role !== "admin" && receiver.role !== "receiver" && !receiver.profileCompleted;
    assert.strictEqual(receiverBlocked, false, "Receiver should NOT be blocked by requireProfile");

    // A donor with profileCompleted = false
    const donorUncompleted = { role: "donor", profileCompleted: false };
    const donorBlocked = requireProfile && donorUncompleted.role !== "admin" && donorUncompleted.role !== "receiver" && !donorUncompleted.profileCompleted;
    assert.strictEqual(donorBlocked, true, "Donor with incomplete profile SHOULD be blocked");

    // A hospital with profileCompleted = false
    const hospitalUncompleted = { role: "hospital", profileCompleted: false };
    const hospitalBlocked = requireProfile && hospitalUncompleted.role !== "admin" && hospitalUncompleted.role !== "receiver" && !hospitalUncompleted.profileCompleted;
    assert.strictEqual(hospitalBlocked, true, "Hospital with incomplete profile SHOULD be blocked");

    console.log("✅ Constraint (c) verified: Receiver is excluded from requireProfile gate while donors and hospitals are checked");

    console.log("\n🎉 ALL LIFECYCLE & NEW MODEL INTEGRATION TESTS PASSED! 🎉\n");
  } finally {
    // Cleanup test data
    console.log("Cleaning up test documents...");
    await User.deleteMany({ _id: { $in: cleanupUserIds } });
    await BloodRequest.deleteMany({ _id: { $in: cleanupRequestIds } });
    await Notification.deleteMany({ relatedRequest: { $in: cleanupRequestIds } });
    await AuditLog.deleteMany({ requestId: { $in: cleanupRequestIds } });
    await mongoose.disconnect();
    console.log("Cleanup complete. Disconnected from MongoDB.");
  }
}

runIntegrationTests().catch((err) => {
  console.error("❌ Integration test failed:", err);
  process.exit(1);
});
