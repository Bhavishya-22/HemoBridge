const mongoose = require("mongoose");

const donationSchema = new mongoose.Schema(
  {
    donorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    receiverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    requestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BloodRequest",
    },

    status: {
      type: String,
      enum: [
        "initiated",
        "verified",
        "completed",
        "failed",
      ],
      default: "initiated",
    },

    verificationStatus: {
      type: String,
      enum: ["pending", "verified", "failed"],
      default: "pending",
    },

    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    verificationNotes: String,

    donationDate: Date,
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model(
  "DonationRecord",
  donationSchema
);
