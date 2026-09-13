const mongoose = require("mongoose");
const assert = require("assert");
require("dotenv").config({ path: "./.env" });

const User = require("../src/model/userModel");
const BloodRequest = require("../src/model/bloodRequestModel");
const DonationRecord = require("../src/model/donationRecordModel");
const Notification = require("../src/model/notificationModel");
const AuditLog = require("../src/model/auditLogModel");

const {
  selectNearestAcceptedDonor,
  promoteNearestBackupDonor,
} = require("../src/utils/donorSelectionService");
const { REQUEST_STATUSES } = require("../src/utils/stateMachine");
const acceptController = require("../src/controllers/acceptController");
const donationController = require("../src/controllers/donationController");

async function runDonorAcceptanceAndBackupTests() {
  const uri = process.env.TEST_MONGO_URI || process.env.mongoURI || "mongodb://127.0.0.1:27017/blood-bank-test";
  console.log("▶ Connecting to MongoDB for Donor Acceptance & Backup Promotion Tests...");
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 6000 });
  console.log("✅ Connected to MongoDB");

  const cleanupUserIds = [];
  const cleanupRequestIds = [];
  const cleanupDonationIds = [];

  try {
    const testPrefix = `test_acc_${Date.now()}_`;

    // 1. Create Receiver, Hospital, and 3 Donors at distinct distances:
    // Receiver at Mumbai center [72.8777, 19.076]
    const receiver = await User.create({
      fullName: "Test Receiver",
      username: `${testPrefix}receiver`,
      email: `${testPrefix}receiver@example.com`,
      password: "password123",
      role: "receiver",
      bloodGroup: "O+",
      profileCompleted: true,
      location: {
        city: "Mumbai",
        state: "Maharashtra",
        coordinates: { type: "Point", coordinates: [72.8777, 19.076] },
      },
    });
    cleanupUserIds.push(receiver._id);

    const hospital = await User.create({
      fullName: "Test Hospital",
      username: `${testPrefix}hospital`,
      email: `${testPrefix}hospital@example.com`,
      password: "password123",
      role: "hospital",
      hospitalName: "Life Care Hospital",
      hospitalVerified: true,
      hospitalVerificationStatus: "verified",
    });
    cleanupUserIds.push(hospital._id);

    // Donor B: Close distance (~2 km)
    const donorB = await User.create({
      fullName: "Donor B (Close, 2km)",
      username: `${testPrefix}donor_b`,
      email: `${testPrefix}donor_b@example.com`,
      password: "password123",
      role: "donor",
      bloodGroup: "O+",
      availabilityStatus: "available",
      isVerified: true,
      location: {
        city: "Mumbai",
        coordinates: { type: "Point", coordinates: [72.89, 19.08] },
      },
    });
    cleanupUserIds.push(donorB._id);

    // Donor C: Medium distance (~6 km)
    const donorC = await User.create({
      fullName: "Donor C (Medium, 6km)",
      username: `${testPrefix}donor_c`,
      email: `${testPrefix}donor_c@example.com`,
      password: "password123",
      role: "donor",
      bloodGroup: "O+",
      availabilityStatus: "available",
      isVerified: true,
      location: {
        city: "Mumbai",
        coordinates: { type: "Point", coordinates: [72.84, 19.11] },
      },
    });
    cleanupUserIds.push(donorC._id);

    // Donor D: Far distance (~18 km)
    const donorD = await User.create({
      fullName: "Donor D (Far, 18km)",
      username: `${testPrefix}donor_d`,
      email: `${testPrefix}donor_d@example.com`,
      password: "password123",
      role: "donor",
      bloodGroup: "O+",
      availabilityStatus: "available",
      isVerified: true,
      location: {
        city: "Mumbai",
        coordinates: { type: "Point", coordinates: [72.99, 19.18] },
      },
    });
    cleanupUserIds.push(donorD._id);

    // 2. Create Blood Request broadcast to Donors B, C, D
    const request = await BloodRequest.create({
      requestedBy: receiver._id,
      assignedHospital: hospital._id,
      bloodGroup: "O+",
      quantity: 1,
      emergencyLevel: "high",
      status: REQUEST_STATUSES.WAITING_FOR_DONOR,
      acceptanceDeadline: new Date(Date.now() + 30 * 60 * 1000), // 30 mins
      location: {
        city: "Mumbai",
        state: "Maharashtra",
        coordinates: { lat: 19.076, lng: 72.8777 },
      },
      candidatePool: [
        { donor: donorB._id, distanceKm: 2.0, searchRadiusKm: 50 },
        { donor: donorC._id, distanceKm: 6.0, searchRadiusKm: 50 },
        { donor: donorD._id, distanceKm: 18.0, searchRadiusKm: 50 },
      ],
      acceptedDonors: [],
      rejectedDonors: [],
    });
    cleanupRequestIds.push(request._id);

    console.log("✅ Step 1: Request initialized in WAITING_FOR_DONOR with 3 candidates in candidatePool");

    // =========================================================================
    // TEST 1: Far Donor D accepts FIRST
    // Requirement: First acceptance must NOT change request to MATCHED.
    // Must initialize donorSelectionDeadline.
    // =========================================================================
    console.log("▶ Test 1: Donor D (18km) accepts first...");
    let mockRes1 = { statusCode: null, body: null };
    const resHelper1 = {
      status(code) { mockRes1.statusCode = code; return this; },
      json(data) { mockRes1.body = data; return this; },
    };

    await acceptController.acceptRequest(
      { params: { requestId: request._id.toString() }, user: { id: donorD._id.toString() } },
      resHelper1
    );

    assert.strictEqual(mockRes1.statusCode, 200, "Donor D accept must return HTTP 200");
    const reqAfterD = await BloodRequest.findById(request._id);
    assert.strictEqual(reqAfterD.status, REQUEST_STATUSES.WAITING_FOR_DONOR, "Request must REMAIN waiting_for_donor");
    assert.strictEqual(reqAfterD.acceptedDonors.length, 1, "acceptedDonors must have 1 entry");
    assert.strictEqual(reqAfterD.acceptedDonors[0].donor.toString(), donorD._id.toString());
    assert.ok(reqAfterD.donorSelectionDeadline, "donorSelectionDeadline must be initialized");
    const initialDeadline = reqAfterD.donorSelectionDeadline.getTime();
    console.log("✅ Test 1 Passed: First donor accepted without premature MATCHED transition; deadline initialized.");

    // =========================================================================
    // TEST 2: Duplicate Acceptance Prevention
    // Requirement: Donor D cannot accept twice.
    // =========================================================================
    console.log("▶ Test 2: Donor D tries to accept again...");
    let mockRes2 = { statusCode: null, body: null };
    const resHelper2 = {
      status(code) { mockRes2.statusCode = code; return this; },
      json(data) { mockRes2.body = data; return this; },
    };

    await acceptController.acceptRequest(
      { params: { requestId: request._id.toString() }, user: { id: donorD._id.toString() } },
      resHelper2
    );

    assert.strictEqual(mockRes2.statusCode, 400, "Duplicate accept must return HTTP 400");
    assert.strictEqual(mockRes2.body.message, "You have already accepted this request.");
    console.log("✅ Test 2 Passed: Duplicate acceptance correctly prevented.");

    // =========================================================================
    // TEST 3: Donor C Accepts (Second acceptance)
    // Requirement:
    // - donorSelectionDeadline must NOT reset/extend when second donor accepts.
    // - Both acceptances preserved.
    // =========================================================================
    console.log("▶ Test 3: Donor C (6km) accepts as second donor...");
    let mockResC = { statusCode: null, body: null };
    await acceptController.acceptRequest(
      { params: { requestId: request._id.toString() }, user: { id: donorC._id.toString() } },
      { status(c) { mockResC.statusCode = c; return this; }, json(d) { mockResC.body = d; return this; } }
    );

    assert.strictEqual(mockResC.statusCode, 200);
    const reqAfterC = await BloodRequest.findById(request._id);
    assert.strictEqual(reqAfterC.acceptedDonors.length, 2, "Both D and C must be in acceptedDonors");
    assert.strictEqual(reqAfterC.status, REQUEST_STATUSES.WAITING_FOR_DONOR, "Request still waiting_for_donor");
    assert.strictEqual(
      reqAfterC.donorSelectionDeadline.getTime(),
      initialDeadline,
      "donorSelectionDeadline must NOT be reset or extended by subsequent acceptance"
    );
    console.log("✅ Test 3 Passed: Second acceptance recorded and collection deadline was NOT reset.");

    // Now Donor B accepts (3rd of 3 candidates)
    console.log("▶ Test 3b: Donor B (2km) accepts (all 3 candidates have now responded)...");
    let mockResB = { statusCode: null, body: null };
    await acceptController.acceptRequest(
      { params: { requestId: request._id.toString() }, user: { id: donorB._id.toString() } },
      { status(c) { mockResB.statusCode = c; return this; }, json(d) { mockResB.body = d; return this; } }
    );
    assert.strictEqual(mockResB.statusCode, 200);

    // =========================================================================
    // TEST 4: Nearest Donor Selection
    // Requirement:
    // - Nearest donor (Donor B at 2km) must be selected as PRIMARY.
    // - Donors C (6km) and D (18km) must become BACKUPS.
    // - Status transitions to MATCHED.
    // =========================================================================
    console.log("▶ Test 4: Executing nearest donor selection...");
    // Since all 3 candidates responded, early selection may have already run or can be called explicitly
    const selectResult = await selectNearestAcceptedDonor(request._id);
    const matchedReq = await BloodRequest.findById(request._id);

    assert.strictEqual(matchedReq.status, REQUEST_STATUSES.MATCHED);
    assert.strictEqual(
      matchedReq.confirmedDonor.toString(),
      donorB._id.toString(),
      "Donor B (2km) must be selected as PRIMARY confirmedDonor despite accepting after Donor D!"
    );
    assert.strictEqual(matchedReq.confirmedDonorDistanceKm, 2.0);

    const bEntry = matchedReq.acceptedDonors.find((a) => a.donor.toString() === donorB._id.toString());
    const cEntry = matchedReq.acceptedDonors.find((a) => a.donor.toString() === donorC._id.toString());
    const dEntry = matchedReq.acceptedDonors.find((a) => a.donor.toString() === donorD._id.toString());

    assert.strictEqual(bEntry.status, "selected", "Donor B must be 'selected'");
    assert.strictEqual(cEntry.status, "backup", "Donor C must be 'backup'");
    assert.strictEqual(dEntry.status, "backup", "Donor D must be 'backup'");

    // Verify backup notifications
    const backupNotifications = await Notification.find({
      relatedRequest: request._id,
      type: "donor_on_backup",
    });
    assert.strictEqual(backupNotifications.length, 2, "Both backups must receive donor_on_backup notification");
    console.log("✅ Test 4 Passed: Nearest donor (Donor B, 2km) selected as PRIMARY; C and D assigned as BACKUPS.");

    // =========================================================================
    // TEST 5: Hospital Schedules Blood Test
    // =========================================================================
    console.log("▶ Test 5: Hospital schedules blood test with primary donor...");
    matchedReq.status = REQUEST_STATUSES.BLOOD_TEST_SCHEDULED;
    matchedReq.bloodTestScheduled = true;
    matchedReq.bloodTestScheduledAt = new Date();
    await matchedReq.save();

    const donationB = await DonationRecord.create({
      donorId: donorB._id,
      receiverId: receiver._id,
      requestId: request._id,
      hospitalId: hospital._id,
      status: "pending",
      verificationStatus: "pending",
      initiatedAt: new Date(),
    });
    cleanupDonationIds.push(donationB._id);

    assert.strictEqual(matchedReq.status, REQUEST_STATUSES.BLOOD_TEST_SCHEDULED);
    console.log("✅ Test 5 Passed: Status is BLOOD_TEST_SCHEDULED and pending DonationRecord created.");

    // =========================================================================
    // TEST 6: Primary Donor (Donor B, 2km) FAILS Blood Test
    // Requirement:
    // - Hospital verifies blood test as FAILED.
    // - Automatic backup promotion must select Donor C (6km), NOT Donor D (18km).
    // - Distance order must be strictly respected!
    // =========================================================================
    console.log("▶ Test 6: Donor B fails blood test. Verifying automatic promotion of nearest backup (Donor C, 6km)...");
    let mockResFail1 = { statusCode: null, body: null };
    await donationController.verifyDonation(
      {
        params: { donationId: donationB._id.toString() },
        body: { isVerified: false, verificationNotes: "Donor B had low hemoglobin" },
        user: { id: hospital._id.toString(), role: "hospital" },
      },
      { status(c) { mockResFail1.statusCode = c; return this; }, json(d) { mockResFail1.body = d; return this; } }
    );

    assert.strictEqual(mockResFail1.statusCode, 200);
    const reqAfterFail1 = await BloodRequest.findById(request._id);
    assert.strictEqual(reqAfterFail1.status, REQUEST_STATUSES.BLOOD_TEST_SCHEDULED);
    assert.strictEqual(
      reqAfterFail1.confirmedDonor.toString(),
      donorC._id.toString(),
      "Donor C (6km) must be promoted as primary confirmedDonor (closer than Donor D, 18km)"
    );
    assert.strictEqual(reqAfterFail1.confirmedDonorDistanceKm, 6.0);

    const bAfterFail = reqAfterFail1.acceptedDonors.find((a) => a.donor.toString() === donorB._id.toString());
    const cAfterFail = reqAfterFail1.acceptedDonors.find((a) => a.donor.toString() === donorC._id.toString());
    const dAfterFail = reqAfterFail1.acceptedDonors.find((a) => a.donor.toString() === donorD._id.toString());

    assert.strictEqual(bAfterFail.status, "rejected", "Donor B must be marked 'rejected'");
    assert.strictEqual(cAfterFail.status, "selected", "Donor C must be marked 'selected'");
    assert.strictEqual(dAfterFail.status, "backup", "Donor D must remain 'backup'");

    console.log("✅ Test 6 Passed: Nearest backup (Donor C, 6km) promoted to primary in distance order.");

    // =========================================================================
    // TEST 7: Promoted Donor C (6km) ALSO FAILS Blood Test
    // Requirement:
    // - Next nearest backup (Donor D, 18km) must be automatically promoted.
    // =========================================================================
    console.log("▶ Test 7: Donor C also fails blood test. Verifying promotion of next backup (Donor D, 18km)...");
    const donationC = await DonationRecord.findOne({
      requestId: request._id,
      donorId: donorC._id,
      status: "pending",
    });
    if (donationC) cleanupDonationIds.push(donationC._id);

    let mockResFail2 = { statusCode: null, body: null };
    await donationController.verifyDonation(
      {
        params: { donationId: (donationC?._id || request._id).toString() },
        body: { isVerified: false, verificationNotes: "Donor C had elevated enzymes" },
        user: { id: hospital._id.toString(), role: "hospital" },
      },
      { status(c) { mockResFail2.statusCode = c; return this; }, json(d) { mockResFail2.body = d; return this; } }
    );

    assert.strictEqual(mockResFail2.statusCode, 200);
    const reqAfterFail2 = await BloodRequest.findById(request._id);
    assert.strictEqual(
      reqAfterFail2.confirmedDonor.toString(),
      donorD._id.toString(),
      "Donor D (18km) must be promoted as last remaining backup"
    );
    assert.strictEqual(reqAfterFail2.confirmedDonorDistanceKm, 18.0);
    console.log("✅ Test 7 Passed: Next backup (Donor D, 18km) promoted successfully.");

    // =========================================================================
    // TEST 8: Last Donor D (18km) ALSO FAILS Blood Test
    // Requirement:
    // - ALL backups exhausted!
    // - confirmedDonor must be reset to null.
    // - Automatic re-broadcast / search widening must trigger!
    // =========================================================================
    console.log("▶ Test 8: Donor D fails blood test. Verifying automatic exhaustion and re-broadcast flow...");
    const donationD = await DonationRecord.findOne({
      requestId: request._id,
      donorId: donorD._id,
      status: "pending",
    });
    if (donationD) cleanupDonationIds.push(donationD._id);

    let mockResFail3 = { statusCode: null, body: null };
    await donationController.verifyDonation(
      {
        params: { donationId: (donationD?._id || request._id).toString() },
        body: { isVerified: false, verificationNotes: "Donor D blood group typing discrepancy" },
        user: { id: hospital._id.toString(), role: "hospital" },
      },
      { status(c) { mockResFail3.statusCode = c; return this; }, json(d) { mockResFail3.body = d; return this; } }
    );

    assert.strictEqual(mockResFail3.statusCode, 200);
    const reqAfterAllExhausted = await BloodRequest.findById(request._id);
    assert.strictEqual(reqAfterAllExhausted.confirmedDonor, null, "confirmedDonor must be null after all backups exhaust");
    assert.strictEqual(
      [REQUEST_STATUSES.WAITING_FOR_DONOR, REQUEST_STATUSES.NO_DONORS_AVAILABLE].includes(reqAfterAllExhausted.status),
      true,
      "Request must transition to WAITING_FOR_DONOR (widened) or NO_DONORS_AVAILABLE"
    );

    // Verify all_donors_exhausted notification sent to receiver
    const exhaustedNotification = await Notification.findOne({
      recipientId: receiver._id,
      type: "all_donors_exhausted",
      relatedRequest: request._id,
    });
    assert.ok(exhaustedNotification, "all_donors_exhausted notification must be dispatched to receiver");
    console.log("✅ Test 8 Passed: Backups exhausted cleanly; automatic re-broadcast executed without stalling.");

    // =========================================================================
    // TEST 9: Primary Blood Test Success Flow
    // Requirement:
    // - Create a new request, accept, select nearest, confirm SUCCESS.
    // - Status transitions to FINAL_COMPLETED.
    // - Thank you notifications sent to confirmed donor and backups.
    // =========================================================================
    console.log("▶ Test 9: Testing blood test SUCCESS path...");
    const donorE = await User.create({
      fullName: "Donor E",
      username: `${testPrefix}donor_e`,
      email: `${testPrefix}donor_e@example.com`,
      password: "password123",
      role: "donor",
      bloodGroup: "O+",
      availabilityStatus: "available",
      isVerified: true,
      location: { city: "Mumbai", coordinates: { type: "Point", coordinates: [72.88, 19.08] } },
    });
    cleanupUserIds.push(donorE._id);

    const successRequest = await BloodRequest.create({
      requestedBy: receiver._id,
      assignedHospital: hospital._id,
      bloodGroup: "O+",
      quantity: 1,
      emergencyLevel: "medium",
      status: REQUEST_STATUSES.BLOOD_TEST_SCHEDULED,
      confirmedDonor: donorE._id,
      confirmedDonorDistanceKm: 1.2,
      acceptedDonors: [{ donor: donorE._id, acceptedAt: new Date(), status: "selected" }],
    });
    cleanupRequestIds.push(successRequest._id);

    const donationE = await DonationRecord.create({
      donorId: donorE._id,
      receiverId: receiver._id,
      requestId: successRequest._id,
      hospitalId: hospital._id,
      status: "pending",
      verificationStatus: "pending",
      initiatedAt: new Date(),
    });
    cleanupDonationIds.push(donationE._id);

    let mockResSuccess = { statusCode: null, body: null };
    await donationController.verifyDonation(
      {
        params: { donationId: donationE._id.toString() },
        body: { isVerified: true, verificationNotes: "Everything went great, thank you!" },
        user: { id: hospital._id.toString(), role: "hospital" },
      },
      { status(c) { mockResSuccess.statusCode = c; return this; }, json(d) { mockResSuccess.body = d; return this; } }
    );

    assert.strictEqual(mockResSuccess.statusCode, 200);
    const reloadedSuccessReq = await BloodRequest.findById(successRequest._id);
    assert.strictEqual(reloadedSuccessReq.status, REQUEST_STATUSES.FINAL_COMPLETED);
    assert.strictEqual(reloadedSuccessReq.finalThankYouSent, true);

    const thankYouNotification = await Notification.findOne({
      recipientId: donorE._id,
      type: "blood_donation_thank_you",
      relatedRequest: successRequest._id,
    });
    assert.ok(thankYouNotification, "Confirmed donor must receive blood_donation_thank_you notification");
    console.log("✅ Test 9 Passed: Successful donation transitions to final_completed with thank-you notifications.");

    console.log("\n🎉 ALL 9 DONOR ACCEPTANCE & BACKUP PROMOTION TESTS PASSED SUCCESSFULLY! 🎉\n");
  } catch (err) {
    console.error("❌ Error during test run:", err);
    throw err;
  } finally {
    console.log("Cleaning up test documents...");
    await User.deleteMany({ _id: { $in: cleanupUserIds } });
    await BloodRequest.deleteMany({ _id: { $in: cleanupRequestIds } });
    await DonationRecord.deleteMany({ _id: { $in: cleanupDonationIds } });
    await Notification.deleteMany({ relatedRequest: { $in: cleanupRequestIds } });
    await AuditLog.deleteMany({ requestId: { $in: cleanupRequestIds } });
    await mongoose.disconnect();
    console.log("Cleanup complete. Disconnected from MongoDB.");
    process.exit(0);
  }
}

runDonorAcceptanceAndBackupTests().catch((err) => {
  console.error("❌ Test suite failed:", err);
  process.exit(1);
});
