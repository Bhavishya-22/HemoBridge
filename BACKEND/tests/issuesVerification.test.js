const mongoose = require("mongoose");
const assert = require("assert");
const dotenv = require("dotenv");
dotenv.config();

const User = require("../src/model/userModel");
const BloodRequest = require("../src/model/bloodRequestModel");
const Notification = require("../src/model/notificationModel");
const { acceptRequest } = require("../src/controllers/acceptController");
const { markAsRead, markAllAsRead } = require("../src/controllers/notificationController");
const { userUpdateProfile } = require("../src/controllers/userController");

async function runTests() {
  console.log("▶ Connecting to MongoDB for 5-Issue Verification Suite...");
  const uri = process.env.mongoURI || process.env.MONGO_URI;
  await mongoose.connect(uri);
  console.log("✅ Connected to MongoDB");

  const testSuffix = `_${Date.now()}`;
  const cleanupUserIds = [];
  const cleanupRequestIds = [];
  const cleanupNotificationIds = [];

  try {
    // =========================================================================
    // ISSUE 1: Immediate Donor Acceptance & Hospital Routing
    // =========================================================================
    console.log("\n▶ TEST ISSUE 1: Immediate donor acceptance triggers hospital routing without delay...");

    // Create Receiver
    const receiver = await User.create({
      fullName: "Test Receiver Issue1",
      username: `recv${testSuffix}`,
      email: `recv${testSuffix}@example.com`,
      phoneNumber: `911${Math.floor(1000000 + Math.random() * 9000000)}`,
      password: "Password123!",
      role: "receiver",
      bloodGroup: "B+",
      location: { city: "Hyderabad", state: "Telangana", coordinates: { type: "Point", coordinates: [78.48, 17.38] } },
    });
    cleanupUserIds.push(receiver._id);

    // Create Hospital
    const hospital = await User.create({
      fullName: "Apollo General Hospital",
      hospitalName: "Apollo General Hospital",
      username: `hosp${testSuffix}`,
      email: `hosp${testSuffix}@example.com`,
      phoneNumber: `912${Math.floor(1000000 + Math.random() * 9000000)}`,
      password: "Password123!",
      role: "hospital",
      hospitalVerified: true,
      hospitalVerificationStatus: "verified",
      hospitalAddress: "Road No 2, Jubilee Hills, Hyderabad",
      hospitalPhone: "040-23456789",
    });
    cleanupUserIds.push(hospital._id);

    // Create Donor
    const donor = await User.create({
      fullName: "Speedy Donor",
      username: `donor${testSuffix}`,
      email: `donor${testSuffix}@example.com`,
      phoneNumber: `913${Math.floor(1000000 + Math.random() * 9000000)}`,
      password: "Password123!",
      role: "donor",
      bloodGroup: "B+",
      availabilityStatus: "available",
      location: { city: "Hyderabad", state: "Telangana", coordinates: { type: "Point", coordinates: [78.49, 17.39] } },
    });
    cleanupUserIds.push(donor._id);

    // Create Blood Request
    const request = await BloodRequest.create({
      requestedBy: receiver._id,
      assignedHospital: hospital._id,
      bloodGroup: "B+",
      quantity: 1,
      emergencyLevel: "critical",
      status: "waiting_for_donor",
      hospitalApproved: true,
      acceptanceDeadline: new Date(Date.now() + 30 * 60 * 1000),
      location: { city: "Hyderabad", state: "Telangana", coordinates: { lat: 17.38, lng: 78.48 } },
      candidatePool: [
        { donor: donor._id, distanceKm: 1.2, searchRadiusKm: 50 },
      ],
      acceptedDonors: [],
      rejectedDonors: [],
    });
    cleanupRequestIds.push(request._id);

    let resData = null;
    let resCode = null;
    const mockRes = {
      status(code) {
        resCode = code;
        return {
          json(data) {
            resData = data;
            return data;
          },
        };
      },
    };

    await acceptRequest(
      { params: { requestId: request._id.toString() }, user: { id: donor._id.toString() } },
      mockRes
    );

    assert.strictEqual(resCode, 200, "Accept request should return 200");
    assert.strictEqual(
      resData.message,
      "Donor matched and routed to hospital immediately.",
      "Response message must match specification"
    );
    assert.strictEqual(resData.data.status, "matched", "Request must transition immediately to 'matched'");
    assert.strictEqual(
      resData.data.matchedDonor.toString(),
      donor._id.toString(),
      "confirmedDonor must be set to the first accepting donor"
    );

    const reloadedReq = await BloodRequest.findById(request._id);
    assert.strictEqual(reloadedReq.status, "matched", "DB status must be 'matched'");
    assert.strictEqual(reloadedReq.confirmedDonor.toString(), donor._id.toString());
    console.log("✅ Issue 1 Passed: First donor acceptance immediately matched & routed to hospital!");

    // =========================================================================
    // ISSUE 5: Notifications Delete on Mark-as-Read + TTL Index
    // =========================================================================
    console.log("\n▶ TEST ISSUE 5: Notifications deletion on read & TTL index check...");

    const notif1 = await Notification.create({
      recipientId: donor._id,
      type: "donor_request",
      message: "Urgent B+ blood request nearby",
    });
    const notif2 = await Notification.create({
      recipientId: donor._id,
      type: "hospital_approved",
      message: "Hospital approved your test",
    });
    cleanupNotificationIds.push(notif1._id, notif2._id);

    // Test markAsRead deletes notif1
    let markResData = null;
    await markAsRead(
      { params: { notificationId: notif1._id.toString() }, user: { id: donor._id.toString() } },
      {
        status(code) {
          return {
            json(d) {
              markResData = d;
              return d;
            },
          };
        },
      }
    );
    assert.strictEqual(markResData.success, true);
    assert.strictEqual(markResData.message, "Notification read and removed");

    const foundNotif1 = await Notification.findById(notif1._id);
    assert.strictEqual(foundNotif1, null, "notif1 must be deleted from DB");
    console.log("✅ markAsRead deleted notification from DB.");

    // Test markAllAsRead deletes notif2
    let markAllData = null;
    await markAllAsRead(
      { user: { id: donor._id.toString() } },
      {
        status(code) {
          return {
            json(d) {
              markAllData = d;
              return d;
            },
          };
        },
      }
    );
    assert.strictEqual(markAllData.success, true);
    assert.strictEqual(markAllData.message, "All notifications read and removed");

    const foundNotif2 = await Notification.findById(notif2._id);
    assert.strictEqual(foundNotif2, null, "notif2 must be deleted from DB by markAllAsRead");
    console.log("✅ markAllAsRead deleted all notifications from DB.");

    // Verify TTL index exists on notification collection
    await Notification.syncIndexes();
    const indexes = await Notification.collection.indexes();
    const ttlIndex = indexes.find((idx) => idx.key && idx.key.expiresAt === 1);
    assert.ok(ttlIndex, "TTL index on expiresAt must exist in Notification collection");
    assert.strictEqual(ttlIndex.expireAfterSeconds, 0, "expireAfterSeconds must be 0");
    console.log("✅ TTL Index verified on Notification collection: { expiresAt: 1 }, expireAfterSeconds: 0");

    // =========================================================================
    // ISSUE 3: Profile Update Role Separation
    // =========================================================================
    console.log("\n▶ TEST ISSUE 3: Profile update role-appropriate field saving...");

    // 1. Hospital Profile Update
    let hospProfileData = null;
    await userUpdateProfile(
      {
        user: { id: hospital._id.toString() },
        body: {
          role: "hospital",
          phoneNumber: "9876543210",
          hospitalName: "Apollo Jubilee Hospitals",
          registrationNumber: `REG-${Date.now()}`,
          hospitalAddress: "Jubilee Hills Checkpost",
          hospitalPhone: "040-99998888",
          // Send rogue donor fields to ensure they are ignored
          bloodGroup: "O+",
          age: 30,
        },
      },
      {
        status(code) {
          return {
            json(d) {
              hospProfileData = d;
              return d;
            },
          };
        },
      }
    );

    assert.strictEqual(hospProfileData.success, true);
    const reloadedHospital = await User.findById(hospital._id);
    assert.strictEqual(reloadedHospital.hospitalName, "Apollo Jubilee Hospitals");
    assert.strictEqual(reloadedHospital.hospitalPhone, "040-99998888");
    assert.strictEqual(reloadedHospital.profileCompleted, true);
    assert.strictEqual(reloadedHospital.bloodGroup, undefined, "bloodGroup must NOT be set on hospital user");
    assert.strictEqual(reloadedHospital.age, undefined, "age must NOT be set on hospital user");
    console.log("✅ Hospital profile update successfully saved hospital fields and skipped donor fields.");

    // 2. Donor Profile Update
    let donorProfileData = null;
    await userUpdateProfile(
      {
        user: { id: donor._id.toString() },
        body: {
          role: "donor",
          phoneNumber: "9123456780",
          bloodGroup: "B+",
          age: 25,
          weight: 68,
          height: 178,
          diseases: ["None"],
          location: {
            city: "Secunderabad",
            state: "Telangana",
            coordinates: { lat: 17.44, lng: 78.50 },
          },
          // Send rogue hospital fields to ensure they are ignored
          hospitalName: "Fake Hospital",
        },
      },
      {
        status(code) {
          return {
            json(d) {
              donorProfileData = d;
              return d;
            },
          };
        },
      }
    );

    assert.strictEqual(donorProfileData.success, true);
    const reloadedDonor = await User.findById(donor._id);
    assert.strictEqual(reloadedDonor.bloodGroup, "B+");
    assert.strictEqual(reloadedDonor.age, 25);
    assert.strictEqual(reloadedDonor.height, 178);
    assert.strictEqual(reloadedDonor.location.city, "Secunderabad");
    assert.strictEqual(reloadedDonor.profileCompleted, true);
    assert.strictEqual(reloadedDonor.hospitalName, undefined, "hospitalName must NOT be set on donor user");
    console.log("✅ Donor profile update successfully saved donor fields and skipped hospital fields.");

    console.log("\n🎉 ALL ISSUE VERIFICATION TESTS PASSED SUCCESSFULLY! 🎉\n");
  } finally {
    // Cleanup
    if (cleanupRequestIds.length > 0) {
      await BloodRequest.deleteMany({ _id: { $in: cleanupRequestIds } });
    }
    if (cleanupNotificationIds.length > 0) {
      await Notification.deleteMany({ _id: { $in: cleanupNotificationIds } });
    }
    if (cleanupUserIds.length > 0) {
      await User.deleteMany({ _id: { $in: cleanupUserIds } });
    }
    await mongoose.disconnect();
    console.log("Cleaned up test documents and disconnected.");
  }
}

runTests().catch((err) => {
  console.error("Test error:", err);
  process.exit(1);
});
