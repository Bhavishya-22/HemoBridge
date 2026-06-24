
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
    "blood_testing",
    "completed",
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
    matchedAt: {
      type: Date,
    },
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
  },
  {
    timestamps: true,
  }
);

bloodRequestSchema.index({ status: 1, createdAt: -1 });
bloodRequestSchema.index({ requestedBy: 1 });
bloodRequestSchema.index({ bloodGroup: 1, status: 1 });
bloodRequestSchema.index({ assignedHospital: 1, status: 1 });

module.exports = mongoose.model("BloodRequest", bloodRequestSchema);