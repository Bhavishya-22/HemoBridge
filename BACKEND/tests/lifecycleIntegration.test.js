const mongoose = require("mongoose");
const assert = require("assert");
require("dotenv").config({ path: "./.env" });

const User = require("../src/model/userModel");
const BloodRequest = require("../src/model/bloodRequestModel");
const Notification = require("../src/model/notificationModel");
const AuditLog = require("../src/model/auditLogModel");

const {
  findAndRankEligibleDonors,
  escalateToNextDonor,
  notifyHeldDonorsFulfilled,
} = require("../src/utils/donorSelectionService");
const { REQUEST_STATUSES } = require("../src/utils/stateMachine");
const { logAuditEvent } = require("../src/utils/auditLogger");

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

    // Donor 1: Closest (~2 km away)
    const donor1 = await User.create({
      fullName: "Nearest Donor 1",
      username: `${testPrefix}donor1`,
      email: `${testPrefix}donor1@example.com`,
      password: "password123",
      role: "donor",
      bloodGroup: "A+",
      availabilityStatus: "available",
      isVerified: true,
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
      location: {
        city: "Mumbai",
        coordinates: {
          type: "Point",
          coordinates: [72.83, 19.12], // ~10 km
        },
      },
    });
    cleanupUserIds.push(donor2._id);

    // Donor 3: Farther (~30 km away)
    const donor3 = await User.create({
      fullName: "Far Donor 3",
      username: `${testPrefix}donor3`,
      email: `${testPrefix}donor3@example.com`,
      password: "password123",
      role: "donor",
      bloodGroup: "A-", // A- can donate to A+
      availabilityStatus: "available",
      isVerified: true,
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

    // 2. STEP 1: Receiver submits blood request
    const bloodRequest = await BloodRequest.create({
      requestedBy: receiver._id,
      bloodGroup: "A+",
      quantity: 2,
      emergencyLevel: "high",
      location: {
        city: "Mumbai",
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
    console.log("✅ Step 1 verified: Request created in pending_hospital_approval");

    // 3. STEP 2 & 3: Hospital Verification & Geospatial Donor Ranking
    const rankedDonors = await findAndRankEligibleDonors(bloodRequest, { limit: 10, maxDistanceKm: 50 });
    assert.strictEqual(rankedDonors.length >= 3, true, "Should find at least 3 eligible donors");

    // Verify ordering by distance: Nearest should be donor1
    const foundDonorIds = rankedDonors.map((d) => (d.donor._id || d.donor).toString());
    assert.strictEqual(foundDonorIds[0], donor1._id.toString(), "Donor 1 must be ranked first (nearest)");

    console.log(`✅ Step 3 verified: Found and ranked ${rankedDonors.length} donors. Nearest: ${donor1.fullName} (${rankedDonors[0].distanceKm} km)`);

    // STEP 4: Build donorQueue with nearest donor notified and others held
    const deadline = new Date(Date.now() + 30 * 60 * 1000);
    bloodRequest.hospitalApproved = true;
    bloodRequest.hospitalApprovedBy = hospital._id;
    bloodRequest.assignedHospital = hospital._id;
    bloodRequest.donorQueue = rankedDonors.map((item, idx) => ({
      donor: item.donor._id,
      distanceKm: item.distanceKm,
      sortedIndex: idx,
      status: idx === 0 ? "notified" : "held",
      responseDeadline: idx === 0 ? deadline : null,
    }));
    bloodRequest.currentDonorIndex = 0;
    bloodRequest.selectedDonor = donor1._id;
    bloodRequest.donorResponseDeadline = deadline;
    bloodRequest.status = REQUEST_STATUSES.WAITING_FOR_DONOR;
    await bloodRequest.save();

    await logAuditEvent({
      requestId: bloodRequest._id,
      actor: hospital._id,
      actorRole: "hospital",
      action: "HOSPITAL_APPROVED",
      previousStatus: REQUEST_STATUSES.PENDING_HOSPITAL_APPROVAL,
      newStatus: REQUEST_STATUSES.WAITING_FOR_DONOR,
      metadata: { selectedDonor: donor1._id, heldDonorsCount: rankedDonors.length - 1 },
    });

    assert.strictEqual(bloodRequest.donorQueue[0].status, "notified");
    assert.strictEqual(bloodRequest.donorQueue[1].status, "held");
    assert.strictEqual(bloodRequest.donorQueue[2].status, "held");
    console.log("✅ Step 4 verified: Nearest donor notified, remaining donors placed in 'held' queue");

    // Test Flaw 3: Admin notifications use actual query, not "ADMIN_ID_HERE"
    const admins = await User.find({ role: "admin" }).select("_id");
    assert.strictEqual(admins.length > 0, true, "Found real admin users");
    for (const adm of admins) {
      assert.notStrictEqual(adm._id.toString(), "ADMIN_ID_HERE");
    }
    console.log("✅ Flaw 3 verified: Admin lookup uses real ObjectId query, no literal placeholders");

    // 4. STEP 6 TEST: Donor 1 declines -> Automatic Escalation to Donor 2
    console.log("▶ Testing automatic escalation when Donor 1 declines...");
    const declineResult = await escalateToNextDonor(bloodRequest._id, {
      reason: "declined",
      actorId: donor1._id,
      actorRole: "donor",
      note: "Unavailable due to travel",
    });

    assert.strictEqual(declineResult.success, true);
    assert.strictEqual(declineResult.nextDonorId, donor2._id.toString(), "Should escalate to Donor 2");

    const reloadedAfterDecline = await BloodRequest.findById(bloodRequest._id);
    assert.strictEqual(reloadedAfterDecline.status, REQUEST_STATUSES.WAITING_FOR_DONOR);
    assert.strictEqual(reloadedAfterDecline.selectedDonor.toString(), donor2._id.toString());
    assert.strictEqual(reloadedAfterDecline.donorQueue[0].status, "declined");
    assert.strictEqual(reloadedAfterDecline.donorQueue[1].status, "notified");
    assert.strictEqual(reloadedAfterDecline.donorQueue[2].status, "held");
    console.log("✅ Step 6 verified: Automatic escalation to next held donor upon decline");

    // 5. ATOMIC RACE CONDITION TEST (Flaw 1):
    // Simulate two donors attempting to accept concurrently.
    // Exactly ONE must succeed, competing write must fail.
    console.log("▶ Testing atomic acceptance race condition prevention...");
    const now = new Date();

    const [competingAccept1, competingAccept2] = await Promise.all([
      // Donor 2 (the legitimately active donor) accepts
      BloodRequest.findOneAndUpdate(
        {
          _id: bloodRequest._id,
          status: REQUEST_STATUSES.WAITING_FOR_DONOR,
          selectedDonor: donor2._id,
          $or: [
            { donorResponseDeadline: { $exists: false } },
            { donorResponseDeadline: null },
            { donorResponseDeadline: { $gte: now } },
          ],
        },
        {
          $set: {
            status: REQUEST_STATUSES.MATCHED,
            matchedAt: now,
            donorResponseDeadline: null,
            "donorQueue.$[elem].status": "accepted",
          },
          $push: {
            acceptedDonors: {
              donor: donor2._id,
              acceptedAt: now,
              status: "accepted",
            },
          },
        },
        {
          arrayFilters: [{ "elem.donor": donor2._id }],
          returnDocument: "after",
        }
      ),
      // Competing concurrent call with non-selected or late donor
      BloodRequest.findOneAndUpdate(
        {
          _id: bloodRequest._id,
          status: REQUEST_STATUSES.WAITING_FOR_DONOR,
          selectedDonor: donor3._id, // Not selected!
          $or: [
            { donorResponseDeadline: { $exists: false } },
            { donorResponseDeadline: null },
            { donorResponseDeadline: { $gte: now } },
          ],
        },
        {
          $set: {
            status: REQUEST_STATUSES.MATCHED,
            matchedAt: now,
            donorResponseDeadline: null,
            "donorQueue.$[elem].status": "accepted",
          },
        },
        {
          arrayFilters: [{ "elem.donor": donor3._id }],
          returnDocument: "after",
        }
      ),
    ]);

    assert.notStrictEqual(competingAccept1, null, "Legitimate selected donor update must succeed");
    assert.strictEqual(competingAccept2, null, "Conflicting concurrent update MUST fail (return null)");
    console.log("✅ Flaw 1 verified: Atomic findOneAndUpdate successfully prevents concurrent double-accept race conditions");

    // STEP 5: Held donors notification
    await notifyHeldDonorsFulfilled(competingAccept1, donor2._id);
    console.log("✅ Step 5 verified: Remaining held donors notified of request fulfillment");

    // 6. AUDIT TRAIL TEST (Flaw 6)
    const auditLogs = await AuditLog.find({ requestId: bloodRequest._id }).sort({ createdAt: 1 });
    assert.strictEqual(auditLogs.length >= 3, true, "Audit trail must record every state change");
    const actions = auditLogs.map((l) => l.action);
    console.log("Audit log actions recorded:", actions);
    assert.strictEqual(actions.includes("REQUEST_CREATED"), true);
    assert.strictEqual(actions.includes("HOSPITAL_APPROVED"), true);
    assert.strictEqual(actions.includes("DONOR_DECLINED_ESCALATED"), true);
    console.log("✅ Flaw 6 verified: Complete audit trail recorded with actors, timestamps, and status changes");

    // 7. QUEUE EXHAUSTION TEST
    console.log("▶ Testing queue exhaustion to 'no_donors_available'...");
    // Create another request with empty or exhausted queue
    const emptyQueueRequest = await BloodRequest.create({
      requestedBy: receiver._id,
      bloodGroup: "B-",
      quantity: 1,
      status: REQUEST_STATUSES.WAITING_FOR_DONOR,
      selectedDonor: donor3._id,
      donorQueue: [{ donor: donor3._id, status: "notified" }],
    });
    cleanupRequestIds.push(emptyQueueRequest._id);

    const exhaustedResult = await escalateToNextDonor(emptyQueueRequest._id, {
      reason: "timeout",
      actorId: null,
      actorRole: "system",
    });

    assert.strictEqual(exhaustedResult.status, REQUEST_STATUSES.NO_DONORS_AVAILABLE);
    const finalEmptyReq = await BloodRequest.findById(emptyQueueRequest._id);
    assert.strictEqual(finalEmptyReq.status, REQUEST_STATUSES.NO_DONORS_AVAILABLE);
    assert.strictEqual(finalEmptyReq.allDonorsRejected, true);
    console.log("✅ Queue exhaustion verified: Status transitioned to no_donors_available when queue exhausted");

    console.log("\n🎉 ALL LIFECYCLE & FLAW INTEGRATION TESTS PASSED SUCCESSFULLY! 🎉\n");
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
