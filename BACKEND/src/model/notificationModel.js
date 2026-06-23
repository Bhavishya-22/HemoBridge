const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    recipientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    message: {
      type: String,
      required: true,
    },

    type: {
      type: String,
      enum: [
        "blood_request",           // New blood request created
        "donors_accepted",         // Multiple donors accepted - notify hospital
        "donation_initiated",      // Donor initiated donation
        "donation_completed",      // Donation physically completed
        "donor_selected",          // Hospital selected donor
        "donor_rejected",          // Hospital rejected donor
        "donation_verified",       // Hospital verified successful
        "donation_rejected",       // Hospital rejected donation
        "request_completed",       // Receiver notification - donation success
      ],
      required: true,
    },

    relatedRequest: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BloodRequest",
    },

    relatedDonation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DonationRecord",
    },

    relatedUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    status: {
      type: String,
      enum: ["sent", "delivered", "read"],
      default: "sent",
    },
  },
  {
    timestamps: true,
  }
);

notificationSchema.index({ recipientId: 1, createdAt: -1 });
notificationSchema.index({ recipientId: 1, status: 1 });

module.exports = mongoose.model("Notification", notificationSchema);