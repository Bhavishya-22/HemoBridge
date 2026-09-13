const mongoose = require("mongoose");

const bloodRequestSchema = new mongoose.Schema(
  {
    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    bloodGroup: {
      type: String,
      enum: ["O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"],
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
      max: 10,
    },
    emergencyLevel: {
      type: String,
      enum: ["low", "medium", "high", "critical"],
      default: "medium",
    },
    status: {
      type: String,
      enum: [
        "pending_hospital_approval",
        "hospital_approved",
        "waiting_for_donor",
        "donor_accepted",
        "matched",
        "no_donors_available",
        "blood_testing",
        "admin_verified",
        "blood_test_scheduled",
        "final_completed",
        "rejected",
        "cancelled",
      ],
      default: "pending_hospital_approval",
    },

    selectedDonor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    notifiedDonors: [
      {
        donor: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        notifiedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    assignedHospital: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    matchedAt: Date,
    location: {
      city: String,
      state: String,
      coordinates: {
        lat: Number,
        lng: Number,
      },
    },
    hospitalName: String,
    description: String,
    completedAt: Date,
    hospitalVerifiedAt: Date,
    hospitalApproved: {
      type: Boolean,
      default: false,
    },
    hospitalApprovedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    hospitalApprovedAt: Date,
    
  // Admin selects from acceptances
  adminVerified: {
    type: Boolean,
    default: false,
  },
  adminVerifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  adminVerifiedAt: Date,

  // Hospital schedules test
  bloodTestScheduled: {
    type: Boolean,
    default: false,
  },
  bloodTestScheduledBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  bloodTestScheduledAt: Date,

  // Track all donors who accepted 
  acceptedDonors: [
    {
      donor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      acceptedAt: Date,
      status: {
        type: String,
        enum: ["accepted", "selected", "backup", "rejected"],
        default: "accepted",
      },
    },
  ],

  // Track rejected donors 
  rejectedDonors: [
    {
      donor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      reason: String,
      rejectedAt: Date,
    },
  ],

  // Backup donors from acceptances 
  backupDonorsOnHold: [
    {
      donor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      heldAt: Date,
      status: {
        type: String,
        enum: ["hold", "active", "notified"],
        default: "hold",
      },
    },
  ],

  // STEP 6: Receiver confirms blood test result (NEW)
  // This tracks whether receiver confirmed success or failure
  receiverBloodTestConfirmation: {
    confirmedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    status: {
      type: String,
      enum: ["success", "failed"],
      default: null,
    },
    message: String,
    confirmedAt: Date,
  },

  // Track if final thank you/donation is complete
  finalThankYouSent: {
    type: Boolean,
    default: false,
  },
  finalThankYouSentAt: Date,

    donorNotificationSent: {
      type: Boolean,
      default: false,
    },
    lastDonorNotifiedAt: Date,

    bloodTestResult: {
      type: String,
      enum: ["pending", "accepted", "rejected"],
      default: "pending",
    },

    receiverConfirmed: {
      type: Boolean,
      default: false,
    },
    receiverConfirmedAt: Date,

    // 🔹 Automatic donor queue logic
    donorQueue: [
      {
        donor: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        distanceKm: Number,
        sortedIndex: Number,
        queuedAt: {
          type: Date,
          default: Date.now,
        },
        notificationSentAt: Date,
        responseDeadline: Date,
        status: {
          type: String,
          enum: ["held", "pending", "notified", "accepted", "declined", "rejected", "timeout", "exhausted"],
          default: "held",
        },
      },
    ],

    currentDonorIndex: {
      type: Number,
      default: 0,
    },

    donorResponseDeadline: Date,

    allDonorsRejected: {
      type: Boolean,
      default: false,
    },

    donorAcceptanceStatus: {
      acceptedCount: {
        type: Number,
        default: 0,
      },
      acceptedDonors: [
        {
          donor: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
          },
          acceptedAt: Date,
        },
      ],
    },
  },
  {
    timestamps: true,
  }
);

bloodRequestSchema.index({ status: 1, createdAt: -1 });
bloodRequestSchema.index({ requestedBy: 1 });
bloodRequestSchema.index({ bloodGroup: 1, status: 1 });
bloodRequestSchema.index({ assignedHospital: 1, status: 1 });
bloodRequestSchema.index({ status: 1, donorResponseDeadline: 1 });

module.exports = mongoose.model("BloodRequest", bloodRequestSchema);