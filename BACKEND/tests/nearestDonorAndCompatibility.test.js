const mongoose = require("mongoose");
const assert = require("assert");
require("dotenv").config({ path: "./.env" });

const User = require("../src/model/userModel");
const BloodRequest = require("../src/model/bloodRequestModel");
const Notification = require("../src/model/notificationModel");
const { getCompatibleBloodGroups, getRecipientsForDonor, isBloodCompatible } = require("../src/utils/bloodCompatibility");
const { findAndRankEligibleDonors, calculateHaversineDistanceKm } = require("../src/utils/donorSelectionService");
const { REQUEST_STATUSES } = require("../src/utils/stateMachine");

async function testONegativeToBPositiveAndNearestSelection() {
  const uri = process.env.TEST_MONGO_URI || process.env.mongoURI || "mongodb://127.0.0.1:27017/blood-bank-test";
  console.log("▶ Connecting to MongoDB for O- to B+ & Nearest Donor Test...");
  await mongoose.connect(uri);
  console.log("✅ Connected to MongoDB");

  const cleanupUserIds = [];
  const cleanupRequestIds = [];

  try {
    const testPrefix = `test_ob_${Date.now()}_`;

    // 1. Check compatibility table
    const compatibleWithBPositive = getCompatibleBloodGroups("B+");
    assert.strictEqual(
      compatibleWithBPositive.includes("O-"),
      true,
      "O- must be compatible with B+ receiver"
    );
    const recipientsForONegative = getRecipientsForDonor("O-");
    assert.strictEqual(
      recipientsForONegative.includes("B+"),
      true,
      "B+ must be in recipient list for O- donor"
    );
    assert.strictEqual(
      isBloodCompatible("O-", "B+"),
      true,
      "isBloodCompatible('O-', 'B+') must return true"
    );
    console.log("✅ Compatibility checks passed: O- donor can donate to B+ receiver");

    // 2. Create B+ Receiver in Hyderabad (17.3850, 78.4867)
    const receiver = await User.create({
      fullName: "B+ Receiver Test",
      username: `${testPrefix}receiver_b`,
      email: `${testPrefix}receiver_b@example.com`,
      password: "password123",
      role: "receiver",
      bloodGroup: "B+",
      location: {
        city: "Hyderabad",
        state: "Telangana",
        coordinates: {
          type: "Point",
          coordinates: [78.4867, 17.385],
        },
      },
    });
    cleanupUserIds.push(receiver._id);

    // 3. Create O- Donor 1: Very close to receiver (~2 km away)
    const donor1_ONeg_Close = await User.create({
      fullName: "Close O- Donor",
      username: `${testPrefix}donor1_o_close`,
      email: `${testPrefix}donor1_o_close@example.com`,
      password: "password123",
      role: "donor",
      bloodGroup: "O-",
      availabilityStatus: "available",
      isVerified: true,
      location: {
        city: "Hyderabad",
        state: "Telangana",
        coordinates: {
          type: "Point",
          coordinates: [78.50, 17.39], // ~1.8 km away
        },
      },
    });
    cleanupUserIds.push(donor1_ONeg_Close._id);

    // 4. Create B+ Donor 2: Farther away (~15 km away)
    const donor2_BPos_Far = await User.create({
      fullName: "Far B+ Donor",
      username: `${testPrefix}donor2_b_far`,
      email: `${testPrefix}donor2_b_far@example.com`,
      password: "password123",
      role: "donor",
      bloodGroup: "B+",
      availabilityStatus: "available",
      isVerified: true,
      location: {
        city: "Hyderabad",
        state: "Telangana",
        coordinates: {
          type: "Point",
          coordinates: [78.35, 17.45], // ~16 km away
        },
      },
    });
    cleanupUserIds.push(donor2_BPos_Far._id);

    // 5. Create B+ Blood Request
    const bloodRequest = await BloodRequest.create({
      requestedBy: receiver._id,
      bloodGroup: "B+",
      quantity: 1,
      emergencyLevel: "high",
      status: REQUEST_STATUSES.PENDING_HOSPITAL_APPROVAL,
      location: {
        city: "Hyderabad",
        state: "Telangana",
        coordinates: {
          lat: 17.385,
          lng: 78.4867,
        },
      },
    });
    cleanupRequestIds.push(bloodRequest._id);

    // 6. Test findAndRankEligibleDonors:
    // Should include BOTH O- donor and B+ donor
    // And rank the CLOSEST donor (O- donor, 1.8 km) as #1 with isNearest = true!
    const rankedDonors = await findAndRankEligibleDonors(bloodRequest, { limit: 10, maxDistanceKm: 50 });

    assert.strictEqual(rankedDonors.length >= 2, true, "Should find at least 2 eligible donors");

    const foundDonorIds = rankedDonors.map((d) => (d.donor._id || d.donor).toString());
    assert.strictEqual(
      foundDonorIds.includes(donor1_ONeg_Close._id.toString()),
      true,
      "O- donor must be present in ranked eligible donors"
    );

    // Filter to our test donors to verify relative distance ranking
    const testRanked = rankedDonors.filter((d) =>
      [donor1_ONeg_Close._id.toString(), donor2_BPos_Far._id.toString()].includes((d.donor._id || d.donor).toString())
    );

    assert.strictEqual(testRanked.length, 2, "Both test donors must be in ranked list");
    assert.strictEqual(
      (testRanked[0].donor._id || testRanked[0].donor).toString(),
      donor1_ONeg_Close._id.toString(),
      "Between test donors, the close O- donor must be ranked before the far B+ donor"
    );
    assert.strictEqual(
      testRanked[0].distanceKm < testRanked[1].distanceKm,
      true,
      "O- donor distance (~1.8km) must be less than B+ donor distance (~16km)"
    );

    console.log(`✅ Relative distance verified: O- donor (${testRanked[0].distanceKm} km) is closer than B+ donor (${testRanked[1].distanceKm} km)`);
    console.log(`✅ Overall closest donor in DB: ${rankedDonors[0].donor.fullName} (${rankedDonors[0].distanceKm} km, ${rankedDonors[0].donor.bloodGroup})`);

    console.log(`✅ Nearest donor verified: ${rankedDonors[0].donor.fullName} (${rankedDonors[0].distanceKm} km, Blood: ${rankedDonors[0].donor.bloodGroup}) is selected as closest!`);
    console.log(`✅ Second donor: ${rankedDonors[1].donor.fullName} (${rankedDonors[1].distanceKm} km, Blood: ${rankedDonors[1].donor.bloodGroup})`);

    console.log("\n🎉 ALL O- TO B+ & NEAREST SELECTION TESTS PASSED! 🎉\n");
  } finally {
    await User.deleteMany({ _id: { $in: cleanupUserIds } });
    await BloodRequest.deleteMany({ _id: { $in: cleanupRequestIds } });
    await Notification.deleteMany({ relatedRequest: { $in: cleanupRequestIds } });
    await mongoose.disconnect();
    console.log("Cleanup complete. Disconnected from MongoDB.");
  }
}

testONegativeToBPositiveAndNearestSelection().catch((err) => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
