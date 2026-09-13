const mongoose = require("mongoose");
const dotenv = require("dotenv");
dotenv.config({ path: "./.env" });

const ensureAdminUser = require("../src/utils/ensureAdminUser");

async function main() {
  const uri = process.env.mongoURI || process.env.MONGO_URI;
  if (!uri) {
    throw new Error("mongoURI is missing in .env");
  }

  console.log("Connecting to MongoDB...");
  await mongoose.connect(uri);
  console.log("Connected to MongoDB.");

  await ensureAdminUser();

  await mongoose.disconnect();
  console.log("Database disconnected. Admin seeding completed successfully.");
}

if (require.main === module) {
  main().catch((err) => {
    console.error("Error seeding admin:", err);
    process.exit(1);
  });
}

module.exports = main;
