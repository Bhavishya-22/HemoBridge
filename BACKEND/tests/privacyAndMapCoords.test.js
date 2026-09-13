const mongoose = require("mongoose");
const dotenv = require("dotenv");
dotenv.config();

const User = require("../src/model/userModel");
const BloodRequest = require("../src/model/bloodRequestModel");
const { viewRequests, myRequests } = require("../src/controllers/requestController");

async function runTest() {
  console.log("▶ Connecting to MongoDB for Privacy & Coordinates Test...");
  const uri = process.env.mongoURI || process.env.MONGO_URI;
  await mongoose.connect(uri);
  console.log("✅ Connected to MongoDB");

  try {
    // 1. Create receiver
    const receiver = await User.create({
      fullName: "Private Receiver",
      username: `receiver_${Date.now()}`,
      email: `receiver_${Date.now()}@example.com`,
      phoneNumber: `9876${Math.floor(100000 + Math.random() * 900000)}`,
      password: "Password123!",
      role: "receiver",
      bloodGroup: "O+",
      location: {
        city: "Hyderabad",
        state: "Telangana",
        coordinates: { type: "Point", coordinates: [78.4867, 17.385] },
      },
    });

    // 2. Create donor
    const donor = await User.create({
      fullName: "Test Donor",
      username: `donor_${Date.now()}`,
      email: `donor_${Date.now()}@example.com`,
      phoneNumber: `9875${Math.floor(100000 + Math.random() * 900000)}`,
      password: "Password123!",
      role: "donor",
      bloodGroup: "O+",
      location: {
        city: "Hyderabad",
        state: "Telangana",
        coordinates: { type: "Point", coordinates: [78.4867, 17.385] },
      },
    });

    // 3. Create 3 open requests at different distances
    // Request 1: Close (Hyderabad, ~1km)
    const req1 = await BloodRequest.create({
      requestedBy: receiver._id,
      bloodGroup: "O+",
      quantity: 1,
      emergencyLevel: "high",
      status: "waiting_for_donor",
      location: {
        city: "Hyderabad",
        state: "Telangana",
        coordinates: { lat: 17.39, lng: 78.49 },
      },
    });

    // Request 2: Farther (Hyderabad, ~10km)
    const req2 = await BloodRequest.create({
      requestedBy: receiver._id,
      bloodGroup: "O+",
      quantity: 2,
      emergencyLevel: "medium",
      status: "waiting_for_donor",
      location: {
        city: "Secunderabad",
        state: "Telangana",
        coordinates: { lat: 17.45, lng: 78.50 },
      },
    });

    // Request 3: Even farther (~25km)
    const req3 = await BloodRequest.create({
      requestedBy: receiver._id,
      bloodGroup: "O+",
      quantity: 1,
      emergencyLevel: "low",
      status: "waiting_for_donor",
      location: {
        city: "Medchal",
        state: "Telangana",
        coordinates: { lat: 17.62, lng: 78.48 },
      },
    });

    // 4. Test viewRequests
    console.log("▶ Testing viewRequests privacy & coordinate filtering...");
    const fakeReq = {
      user: { id: donor._id.toString(), role: "donor" },
    };

    let responseData = null;
    const fakeRes = {
      status: (code) => ({
        json: (data) => {
          responseData = data;
          return data;
        },
      }),
    };

    await viewRequests(fakeReq, fakeRes);

    if (!responseData || !responseData.success) {
      throw new Error("viewRequests failed or returned non-success response");
    }

    console.log(`Found ${responseData.requests.length} open requests for donor`);
    const requests = responseData.requests;

    // Verify ordering
    if (requests.length < 3) {
      throw new Error("Expected at least 3 requests");
    }

    // Check nearest request (index 0)
    const nearest = requests[0];
    console.log("Nearest request distance:", nearest.distanceKm, "km");
    if (!nearest.location || !nearest.location.coordinates) {
      throw new Error("FAIL: Nearest request (index 0) MUST have location.coordinates");
    }
    console.log("✅ Nearest request retains exact coordinates:", nearest.location.coordinates);

    // Check privacy on requestedBy
    if (nearest.requestedBy.phoneNumber || nearest.requestedBy.email) {
      throw new Error("FAIL: requestedBy leaked phoneNumber or email in viewRequests!");
    }
    console.log("✅ requestedBy does NOT leak phoneNumber or email (only fullName):", nearest.requestedBy.fullName);

    // Check subsequent requests (index > 0)
    for (let i = 1; i < requests.length; i++) {
      const otherReq = requests[i];
      if (otherReq.location && otherReq.location.coordinates) {
        throw new Error(`FAIL: Non-nearest request at index ${i} leaked location.coordinates!`);
      }
      if (otherReq.requestedBy.phoneNumber || otherReq.requestedBy.email) {
        throw new Error(`FAIL: Non-nearest request at index ${i} leaked contact info!`);
      }
      if (typeof otherReq.distanceKm !== "number") {
        throw new Error(`FAIL: Non-nearest request at index ${i} missing distanceKm!`);
      }
      console.log(`✅ Request at index ${i} (${otherReq.distanceKm} km away): coordinates stripped, distance preserved, city=${otherReq.location?.city}`);
    }

    // 5. Test myRequests for confirmedDonor location
    console.log("▶ Testing myRequests confirmedDonor location populate...");
    // Update req1 to matched with donor as confirmedDonor
    req1.status = "matched";
    req1.confirmedDonor = donor._id;
    await req1.save();

    const receiverReq = {
      user: { id: receiver._id.toString(), role: "receiver" },
    };
    let receiverData = null;
    const receiverRes = {
      status: (code) => ({
        json: (data) => {
          receiverData = data;
          return data;
        },
      }),
    };

    await myRequests(receiverReq, receiverRes);
    const myMatchedReq = receiverData.requests.find((r) => r._id.toString() === req1._id.toString());
    if (!myMatchedReq || !myMatchedReq.confirmedDonor) {
      throw new Error("FAIL: Matched request not found in myRequests");
    }

    if (!myMatchedReq.confirmedDonor.location) {
      throw new Error("FAIL: confirmedDonor did not include location in myRequests!");
    }
    console.log("✅ confirmedDonor populated with location for receiver:", myMatchedReq.confirmedDonor.location);

    // Clean up
    await BloodRequest.deleteMany({ _id: { $in: [req1._id, req2._id, req3._id] } });
    await User.deleteMany({ _id: { $in: [receiver._id, donor._id] } });
    console.log("✅ Cleaned up test data.");

    console.log("\n🎉 ALL PRIVACY & MAP COORDINATE TESTS PASSED SUCCESSFULLY! 🎉\n");
  } finally {
    await mongoose.disconnect();
  }
}

runTest().catch((err) => {
  console.error("Test error:", err);
  process.exit(1);
});
