const mongoose = require("mongoose");
const dotenv = require("dotenv");
dotenv.config();

const User = require("../src/model/userModel");
const BloodRequest = require("../src/model/bloodRequestModel");

async function seed() {
  const uri = process.env.mongoURI || process.env.MONGO_URI;
  await mongoose.connect(uri);
  console.log("Connected to MongoDB for map test seeding");

  // Clean old test seed users if any
  await User.deleteMany({ email: { $in: ["donor_map@example.com", "receiver_map@example.com"] } });

  // 1. Create Donor
  const donor = await User.create({
    fullName: "Alex Rivera (Donor)",
    username: "donor_map",
    email: "donor_map@example.com",
    phoneNumber: "9876000001",
    password: "Password123!",
    role: "donor",
    bloodGroup: "O+",
    profileCompleted: true,
    location: {
      city: "Hyderabad",
      state: "Telangana",
      coordinates: { type: "Point", coordinates: [78.4867, 17.385] },
    },
  });

  // 2. Create Receiver
  const receiver = await User.create({
    fullName: "Priya Sharma (Receiver)",
    username: "receiver_map",
    email: "receiver_map@example.com",
    phoneNumber: "9876000002",
    password: "Password123!",
    role: "receiver",
    bloodGroup: "O+",
    profileCompleted: true,
    location: {
      city: "Hyderabad",
      state: "Telangana",
      coordinates: { type: "Point", coordinates: [78.4744, 17.3616] },
    },
  });

  // Clean old requests created by this receiver
  await BloodRequest.deleteMany({ requestedBy: receiver._id });

  // 3. Create Open Request 1 (Nearest to Donor, ~1.2 km away)
  await BloodRequest.create({
    requestedBy: receiver._id,
    bloodGroup: "O+",
    quantity: 2,
    emergencyLevel: "critical",
    status: "waiting_for_donor",
    hospitalApproved: true,
    hospitalName: "Apollo Hospitals",
    location: {
      city: "Hyderabad",
      state: "Telangana",
      coordinates: { lat: 17.392, lng: 78.491 },
    },
    description: "Urgent O+ blood needed for trauma surgery",
  });

  // 4. Create Open Request 2 (Farther from Donor, ~12 km away)
  await BloodRequest.create({
    requestedBy: receiver._id,
    bloodGroup: "O+",
    quantity: 1,
    emergencyLevel: "medium",
    status: "waiting_for_donor",
    hospitalApproved: true,
    hospitalName: "Yashoda Hospitals",
    location: {
      city: "Secunderabad",
      state: "Telangana",
      coordinates: { lat: 17.445, lng: 78.502 },
    },
    description: "Planned knee replacement",
  });

  // 5. Create Matched Request for Receiver (has confirmedDonor = donor)
  await BloodRequest.create({
    requestedBy: receiver._id,
    confirmedDonor: donor._id,
    bloodGroup: "O+",
    quantity: 1,
    emergencyLevel: "high",
    status: "matched",
    hospitalApproved: true,
    hospitalName: "Care Hospital Banjara",
    location: {
      city: "Hyderabad",
      state: "Telangana",
      coordinates: { lat: 17.4156, lng: 78.4485 },
    },
    description: "Patient ready, waiting for hospital verification",
  });

  console.log("Seeding complete:");
  console.log("Donor login: donor_map@example.com / Password123!");
  console.log("Receiver login: receiver_map@example.com / Password123!");

  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error("Seed error:", err);
  process.exit(1);
});
