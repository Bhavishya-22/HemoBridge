const mongoose = require("mongoose");
const assert = require("assert");
require("dotenv").config({ path: "./.env" });

const User = require("../src/model/userModel");
const BloodRequest = require("../src/model/bloodRequestModel");
const DonationRecord = require("../src/model/donationRecordModel");
const Notification = require("../src/model/notificationModel");
const AuditLog = require("../src/model/auditLogModel");

const { selectNearestAcceptedDonor } = require("../src/utils/donorSelectionService");
const { REQUEST_STATUSES } = require("../src/utils/stateMachine");
const hospitalBloodTestController = require("../src/controllers/hospitalBloodTestController");
const donationController = require("../src/controllers/donationController");
const requestController = require("../src/controllers/requestController");
const userController = require("../src/controllers/userController");

async function runHospitalVerificationAndDetailsTests() {
  const uri = process.env.TEST_MONGO_URI || process.env.mongoURI || "mongodb://127.0.0.1:27017/blood-bank-test";
  console.log("▶ Connecting to MongoDB for Hospital Verification & Details Tests...");
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 6000 });
  console.log("✅ Connected to MongoDB");

  const cleanupUserIds = [];
  const cleanupRequestIds = [];
  const cleanupDonationIds = [];

  try {
    const testPrefix = `test_hosp_${Date.now()}_`;

    // 1. Create Hospital, Receiver, Primary Donor, Backup Donor, and Unrelated User
    const hospital = await User.create({
      fullName: "City Care Hospital",
      username: `${testPrefix}hospital`,
      email: `${testPrefix}hosp@example.com`,
      password: "password123",
      role: "hospital",
      hospitalName: "City Care Super Specialty Hospital",
      hospitalAddress: "456 Healthcare Blvd, Central District",
      hospitalPhone: "+91 99999 11111",
      hospitalVerified: true,
      hospitalVerificationStatus: "verified",
      location: { city: "Mumbai", state: "Maharashtra", coordinates: { type: "Point", coordinates: [72.85, 19.05] } },
    });
    cleanupUserIds.push(hospital._id);

    const receiver = await User.create({
      fullName: "Patient Deepak",
      username: `${testPrefix}receiver`,
      email: `${testPrefix}receiver@example.com`,
      password: "password123",
      role: "receiver",
      phoneNumber: "+91 88888 22222",
      bloodGroup: "A+",
      location: { city: "Mumbai", state: "Maharashtra", coordinates: { type: "Point", coordinates: [72.86, 19.06] } },
    });
    cleanupUserIds.push(receiver._id);

    const donorA = await User.create({
      fullName: "Donor Anand",
      username: `${testPrefix}donor_a`,
      email: `${testPrefix}donor_a@example.com`,
      password: "password123",
      role: "donor",
      phoneNumber: "+91 77777 33333",
      bloodGroup: "A+",
      weight: 68,
      height: 175,
      diseases: [],
      availabilityStatus: "available",
      isVerified: true,
      location: { city: "Mumbai", state: "Maharashtra", coordinates: { type: "Point", coordinates: [72.87, 19.06] } },
    });
    cleanupUserIds.push(donorA._id);

    const donorB = await User.create({
      fullName: "Donor Bharat",
      username: `${testPrefix}donor_b`,
      email: `${testPrefix}donor_b@example.com`,
      password: "password123",
      role: "donor",
      phoneNumber: "+91 66666 44444",
      bloodGroup: "A+",
      weight: 72,
      height: 180,
      diseases: ["Seasonal allergies"],
      availabilityStatus: "available",
      isVerified: true,
      location: { city: "Mumbai", state: "Maharashtra", coordinates: { type: "Point", coordinates: [72.90, 19.06] } },
    });
    cleanupUserIds.push(donorB._id);

    const unrelatedUser = await User.create({
      fullName: "Unrelated User",
      username: `${testPrefix}unrelated`,
      email: `${testPrefix}unrelated@example.com`,
      password: "password123",
      role: "donor",
      phoneNumber: "+91 55555 55555",
      bloodGroup: "O-",
      location: { city: "Delhi", state: "Delhi" },
    });
    cleanupUserIds.push(unrelatedUser._id);

    console.log("✅ Step 1: Users created successfully with height and hospital contact fields.");

    // =========================================================================
    // TEST 1: User Profile Update persists height (Issue 2)
    // =========================================================================
    console.log("▶ Test 1: Testing height persistence in user profile update...");
    let mockProfileRes = { statusCode: null, body: null };
    await userController.userUpdateProfile(
      {
        user: { id: donorA._id.toString() },
        body: {
          phoneNumber: "+91 77777 33333",
          bloodGroup: "A+",
          age: 25,
          weight: 70,
          height: 178,
          diseases: [],
          role: "donor",
        },
      },
      { status(c) { mockProfileRes.statusCode = c; return this; }, json(d) { mockProfileRes.body = d; return this; } }
    );
    assert.strictEqual(mockProfileRes.statusCode, 200);
    const updatedDonorA = await User.findById(donorA._id);
    assert.strictEqual(updatedDonorA.height, 178, "Donor height must be updated to 178cm");
    console.log("✅ Test 1 Passed: Height persisted correctly in user profile.");

    // =========================================================================
    // TEST 2: Primary donor notification message contains hospital name, address, and receiver phone
    // =========================================================================
    console.log("▶ Test 2: Testing selectNearestAcceptedDonor primary notification formatting...");
    const request = await BloodRequest.create({
      requestedBy: receiver._id,
      assignedHospital: hospital._id,
      bloodGroup: "A+",
      quantity: 2,
      emergencyLevel: "high",
      status: REQUEST_STATUSES.WAITING_FOR_DONOR,
      location: receiver.location,
      acceptedDonors: [
        { donor: donorA._id, acceptedAt: new Date(Date.now() - 5000), status: "accepted" },
        { donor: donorB._id, acceptedAt: new Date(Date.now() - 3000), status: "accepted" },
      ],
      candidatePool: [
        { donor: donorA._id, distanceKm: 1.5, status: "accepted" },
        { donor: donorB._id, distanceKm: 4.5, status: "accepted" },
      ],
    });
    cleanupRequestIds.push(request._id);

    const selectResult = await selectNearestAcceptedDonor(request._id);
    assert.strictEqual(selectResult.success, true);

    const primaryNotification = await Notification.findOne({
      recipientId: donorA._id,
      type: "admin_selected_for_test",
      relatedRequest: request._id,
    });
    assert.ok(primaryNotification, "Primary donor must receive admin_selected_for_test notification");
    assert.ok(
      primaryNotification.message.includes("City Care Super Specialty Hospital"),
      `Notification must include hospital name. Found: ${primaryNotification.message}`
    );
    assert.ok(
      primaryNotification.message.includes("456 Healthcare Blvd"),
      `Notification must include hospital address. Found: ${primaryNotification.message}`
    );
    assert.ok(
      primaryNotification.message.includes("+91 88888 22222"),
      `Notification must include receiver phone. Found: ${primaryNotification.message}`
    );
    console.log("✅ Test 2 Passed: Primary notification properly includes hospital name, address, and receiver phone.");

    // =========================================================================
    // TEST 3: Hospital schedules blood test -> creates DonationRecord in pending status
    // =========================================================================
    console.log("▶ Test 3: Testing scheduleBloodTest creating pending DonationRecord...");
    let mockScheduleRes = { statusCode: null, body: null };
    await hospitalBloodTestController.scheduleBloodTest(
      {
        params: { requestId: request._id.toString() },
        body: { testScheduleDate: "Tomorrow at 10:00 AM" },
        user: { id: hospital._id.toString(), role: "hospital" },
      },
      { status(c) { mockScheduleRes.statusCode = c; return this; }, json(d) { mockScheduleRes.body = d; return this; } }
    );
    assert.strictEqual(mockScheduleRes.statusCode, 200);
    assert.ok(mockScheduleRes.body.data.donationId, "scheduleBloodTest must return donationId");
    cleanupDonationIds.push(mockScheduleRes.body.data.donationId);

    const initialDonation = await DonationRecord.findById(mockScheduleRes.body.data.donationId);
    assert.ok(initialDonation, "DonationRecord must exist in DB");
    assert.strictEqual(initialDonation.status, "pending");
    assert.strictEqual(initialDonation.verificationStatus, "pending");
    assert.strictEqual(initialDonation.donorId.toString(), donorA._id.toString());
    assert.strictEqual(initialDonation.receiverId.toString(), receiver._id.toString());
    assert.strictEqual(initialDonation.hospitalId.toString(), hospital._id.toString());
    console.log("✅ Test 3 Passed: Pending DonationRecord created upon scheduling blood test.");

    // =========================================================================
    // TEST 4: Receiver confirmation endpoints are blocked/deprecated (returns 403)
    // =========================================================================
    console.log("▶ Test 4: Testing receiverConfirmSuccess and receiverConfirmFailure are blocked (403)...");
    let mockReceiverSuccessRes = { statusCode: null, body: null };
    await hospitalBloodTestController.receiverConfirmSuccess(
      {
        params: { requestId: request._id.toString() },
        user: { id: receiver._id.toString(), role: "receiver" },
      },
      { status(c) { mockReceiverSuccessRes.statusCode = c; return this; }, json(d) { mockReceiverSuccessRes.body = d; return this; } }
    );
    assert.strictEqual(mockReceiverSuccessRes.statusCode, 403, "receiverConfirmSuccess must return 403 Forbidden");

    let mockReceiverFailRes = { statusCode: null, body: null };
    await hospitalBloodTestController.receiverConfirmFailure(
      {
        params: { requestId: request._id.toString() },
        user: { id: receiver._id.toString(), role: "receiver" },
      },
      { status(c) { mockReceiverFailRes.statusCode = c; return this; }, json(d) { mockReceiverFailRes.body = d; return this; } }
    );
    assert.strictEqual(mockReceiverFailRes.statusCode, 403, "receiverConfirmFailure must return 403 Forbidden");
    console.log("✅ Test 4 Passed: Receiver self-certification endpoints safely blocked.");

    // =========================================================================
    // TEST 5: getRequestDetail security guard (403 for unauthorized users, 200 for authorized)
    // =========================================================================
    console.log("▶ Test 5: Testing getRequestDetail authorization and populated details...");
    // 5a. Unauthorized user receives 403
    let mockUnauthRes = { statusCode: null, body: null };
    await requestController.getRequestDetail(
      {
        params: { requestId: request._id.toString() },
        user: { id: unrelatedUser._id.toString(), role: "donor" },
      },
      { status(c) { mockUnauthRes.statusCode = c; return this; }, json(d) { mockUnauthRes.body = d; return this; } }
    );
    assert.strictEqual(mockUnauthRes.statusCode, 403, "Unrelated user must be blocked with 403");

    // 5b. Receiver receives 200 with donor details (weight, height, diseases)
    let mockReceiverDetailRes = { statusCode: null, body: null };
    await requestController.getRequestDetail(
      {
        params: { requestId: request._id.toString() },
        user: { id: receiver._id.toString(), role: "receiver" },
      },
      { status(c) { mockReceiverDetailRes.statusCode = c; return this; }, json(d) { mockReceiverDetailRes.body = d; return this; } }
    );
    assert.strictEqual(mockReceiverDetailRes.statusCode, 200);
    const detailData = mockReceiverDetailRes.body.data;
    assert.strictEqual(detailData.confirmedDonor.fullName, "Donor Anand");
    assert.strictEqual(detailData.confirmedDonor.phoneNumber, "+91 77777 33333");
    assert.strictEqual(detailData.confirmedDonor.height, 178);
    assert.strictEqual(detailData.confirmedDonor.weight, 70);
    assert.ok(detailData.donationId, "detail response must include donationId");

    // 5c. Donor receives 200 with receiver and hospital details (hospitalAddress)
    let mockDonorDetailRes = { statusCode: null, body: null };
    await requestController.getRequestDetail(
      {
        params: { requestId: request._id.toString() },
        user: { id: donorA._id.toString(), role: "donor" },
      },
      { status(c) { mockDonorDetailRes.statusCode = c; return this; }, json(d) { mockDonorDetailRes.body = d; return this; } }
    );
    assert.strictEqual(mockDonorDetailRes.statusCode, 200);
    assert.strictEqual(mockDonorDetailRes.body.data.receiver.phoneNumber, "+91 88888 22222");
    assert.strictEqual(mockDonorDetailRes.body.data.assignedHospital.hospitalAddress, "456 Healthcare Blvd, Central District");
    console.log("✅ Test 5 Passed: getRequestDetail properly enforces authorization and returns enriched data.");

    // =========================================================================
    // TEST 6: Hospital rejects blood test -> auto-promotes Donor B & creates pending donation
    // =========================================================================
    console.log("▶ Test 6: Testing hospital rejection and auto-promotion of backup Donor B...");
    let mockVerifyFailRes = { statusCode: null, body: null };
    await donationController.verifyDonation(
      {
        params: { donationId: initialDonation._id.toString() },
        body: { isVerified: false, verificationNotes: "Donor A blood test failed: high liver enzymes" },
        user: { id: hospital._id.toString(), role: "hospital" },
      },
      { status(c) { mockVerifyFailRes.statusCode = c; return this; }, json(d) { mockVerifyFailRes.body = d; return this; } }
    );
    assert.strictEqual(mockVerifyFailRes.statusCode, 200);
    assert.strictEqual(mockVerifyFailRes.body.data.promoted, true);

    const reloadedReqAfterFail = await BloodRequest.findById(request._id);
    assert.strictEqual(reloadedReqAfterFail.confirmedDonor.toString(), donorB._id.toString());
    assert.strictEqual(reloadedReqAfterFail.status, REQUEST_STATUSES.BLOOD_TEST_SCHEDULED);

    // Verify pending DonationRecord created for promoted Donor B
    const promotedDonation = await DonationRecord.findOne({
      requestId: request._id,
      donorId: donorB._id,
      status: "pending",
    });
    assert.ok(promotedDonation, "Pending DonationRecord must exist for newly promoted Donor B");
    cleanupDonationIds.push(promotedDonation._id);
    console.log("✅ Test 6 Passed: Hospital rejection successfully promoted Donor B with pending DonationRecord.");

    // =========================================================================
    // TEST 7: Hospital verifies Donor B blood test -> completes donation & sends thank yous
    // =========================================================================
    console.log("▶ Test 7: Testing hospital verification SUCCESS on Donor B...");
    let mockVerifySuccessRes = { statusCode: null, body: null };
    await donationController.verifyDonation(
      {
        params: { donationId: promotedDonation._id.toString() },
        body: { isVerified: true, verificationNotes: "Blood test verified and fully compatible" },
        user: { id: hospital._id.toString(), role: "hospital" },
      },
      { status(c) { mockVerifySuccessRes.statusCode = c; return this; }, json(d) { mockVerifySuccessRes.body = d; return this; } }
    );
    assert.strictEqual(mockVerifySuccessRes.statusCode, 200);

    const finalReq = await BloodRequest.findById(request._id);
    assert.strictEqual(finalReq.status, REQUEST_STATUSES.FINAL_COMPLETED);
    assert.strictEqual(finalReq.bloodTestResult, "accepted");
    assert.strictEqual(finalReq.finalThankYouSent, true);

    const finalDonation = await DonationRecord.findById(promotedDonation._id);
    assert.strictEqual(finalDonation.status, "completed");
    assert.strictEqual(finalDonation.verificationStatus, "verified");

    // Check notifications
    const donorBThankYou = await Notification.findOne({
      recipientId: donorB._id,
      type: "blood_donation_thank_you",
      relatedRequest: request._id,
    });
    assert.ok(donorBThankYou, "Donor B must receive blood_donation_thank_you notification");

    const receiverCompletedNotif = await Notification.findOne({
      recipientId: receiver._id,
      type: "request_completed",
      relatedRequest: request._id,
    });
    assert.ok(receiverCompletedNotif, "Receiver must receive request_completed notification");
    console.log("✅ Test 7 Passed: Hospital verification completed request and sent notifications.");

    console.log("\n🎉 ALL 7 HOSPITAL VERIFICATION & DETAILS TESTS PASSED SUCCESSFULLY! 🎉\n");
  } catch (err) {
    console.error("❌ Test error:", err);
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

runHospitalVerificationAndDetailsTests().catch((err) => {
  console.error("❌ Test suite failed:", err);
  process.exit(1);
});
