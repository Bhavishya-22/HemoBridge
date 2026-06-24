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
      "hospital_approval_required",
      "hospital_approved",
      "hospital_rejected",
      "donor_request",
      "donor_accepted",
      "donor_rejected",
      "blood_request",
      "donor_on_hold",
      "next_donor_selected",
      "blood_test_accepted",
      "blood_test_rejected",
      "request_completed",
      "general",
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
    priority: {
    type: String,
    enum: ["low", "normal", "high", "critical"],
    default: "normal",
    },
  },
  {
    timestamps: true,
  }
);

notificationSchema.index({ recipientId: 1, createdAt: -1 });
notificationSchema.index({ recipientId: 1, status: 1 });

module.exports = mongoose.model("Notification", notificationSchema);