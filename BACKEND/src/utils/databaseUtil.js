require('dotenv').config({
    path:'./.env'
});

const mongoose = require('mongoose');

const connectDB = async () => {
//  console.log(process.env.mongoURI);
    try {
        await mongoose.connect(process.env.mongoURI);
        console.log("✅ MongoDB Connected Successfully");
    } catch (error) {
        console.error("❌ MongoDB Connection Failed:", error.message);
        process.exit(1); // stop server if DB fails
    }
};

module.exports = connectDB;