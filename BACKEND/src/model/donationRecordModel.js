const mongoose = require("mongoose");

const donationSchema = new mongoose.Schema(
  {
    donorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    receiverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    requestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BloodRequest",
      required: true,
    },
    hospitalId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    status: {
      type: String,
      enum: [
        "matched",      // Hospital selected, waiting for donor action
        "initiated",    // Donor started donation process
        "completed",    // Physical donation completed
        "cancelled",
        "failed",
      ],
      default: "matched",
    },
    verificationStatus: {
      type: String,
      enum: [
        "pending",      // Waiting for hospital verification
        "verified",     // Hospital verified successful
        "rejected",     // Hospital rejected donation
      ],
      default: "pending",
    },
    donationDate: Date,
    donorNotes: {
      type: String,
      default: "",
    },
    hospitalVerificationNotes: {
      type: String,
      default: "",
    },
    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    initiatedAt: {
      type: Date,
      default: Date.now,
    },
    completedAt: Date,
    verifiedAt: Date,
  },
  {
    timestamps: true,
  }
);

donationSchema.index({ donorId: 1, status: 1 });
donationSchema.index({ receiverId: 1, status: 1 });
donationSchema.index({ requestId: 1 });
donationSchema.index({ hospitalId: 1, verificationStatus: 1 });

module.exports = mongoose.model("DonationRecord", donationSchema);