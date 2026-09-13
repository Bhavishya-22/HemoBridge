require('dotenv').config({
    path: './.env'
});

const mongoose = require('mongoose');

const connectDB = async () => {
    const primaryURI = process.env.mongoURI;
    const localURI = "mongodb://127.0.0.1:27017/blood-bank";

    try {
        console.log("Connecting to primary MongoDB URI...");
        await mongoose.connect(primaryURI, { serverSelectionTimeoutMS: 4000 });
        console.log("✅ MongoDB Connected Successfully to Primary Cluster");
    } catch (primaryError) {
        console.warn(`⚠️ Primary MongoDB connection failed (${primaryError.message}).`);
        console.log(`🔄 Attempting fallback connection to local MongoDB (${localURI})...`);
        try {
            await mongoose.connect(localURI, { serverSelectionTimeoutMS: 3000 });
            console.log("✅ MongoDB Connected Successfully to Local Database");
        } catch (localError) {
            console.error("❌ MongoDB Connection Failed on both primary and local instances:", localError.message);
            process.exit(1);
        }
    }
};

module.exports = connectDB;