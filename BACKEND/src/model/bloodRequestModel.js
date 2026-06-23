
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
        "pending",        // Waiting for donors to accept
        "accepted",       // Donors accepted, waiting for hospital selection
        "matched",        // Hospital selected donor
        "completed",      // Donation completed and verified
        "cancelled",
        "expired",
        "donor_accepted",
        "donor_rejected",
        "donor_selected",
      ],
      default: "pending",
    },
    acceptedDonors: [
      {
        donor: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        status: {
          type: String,
          enum: ["pending", "selected", "rejected"],
          default: "pending",
        },
        acceptedAt: {
          type: Date,
          default: Date.now,
        },
        selectedAt: Date,
        rejectedAt: Date,
        rejectionReason: String,
      },
    ],
    acceptedCount: {
      type: Number,
      default: 0,
    },
    selectedDonor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    assignedHospital: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    matchedAt: {
      type: Date,
    },
    location: String,
    hospitalName: String,
    description: String,
    completedAt: Date,
    hospitalVerifiedAt: Date,
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