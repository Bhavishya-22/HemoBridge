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
        // ===== STEP 2: Hospital Approval =====
        "hospital_approval_required",
        "hospital_approved",
        "hospital_rejected",

        // ===== STEP 3: Donor Accept/Reject =====
        "donor_request",
        "donor_accepted",
        "donor_rejected",

        // ===== STEP 4: Admin Verification =====
        "admin_selected_for_test",
        "donor_on_backup",
        "admin_selected_donor",

        // ===== STEP 5: Blood Test Scheduling =====
        "blood_test_scheduled",

        // ===== STEP 6: Blood Test Verification =====
        "blood_test_accepted",
        "blood_test_rejected",
        "blood_donation_thank_you",
        "blood_donation_completed",
        "backup_donor_thanks",
        "donor_not_selected_thanks",
        "donor_rejection_thanks",
        "blood_test_failed",
        "blood_test_failed_next_donor",
        "all_donors_exhausted",

        // ===== STEP 7: Receiver Confirmation =====
        "receiver_thank_you",
        "receiver_thank_you_backup",
        "receiver_thank_you_accepted",
        "receiver_thank_you_all",

        // ===== GENERAL =====
        "request_completed",
        "blood_request",
        "next_donor_selected",
        "new_approved_request",
        "donor_notified",
        "request_fulfilled",
        "no_donors_available",
        "donor_declined",
        "donor_timeout_escalated",
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

    expiresAt: {
      type: Date,
      default: null, // null = never auto-expire (action-required notifications)
    },
  },
  {
    timestamps: true,
  }
);

notificationSchema.index({ recipientId: 1, createdAt: -1 });
notificationSchema.index({ recipientId: 1, status: 1 });
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("Notification", notificationSchema);