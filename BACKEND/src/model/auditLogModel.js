const mongoose = require("mongoose");

const auditLogSchema = new mongoose.Schema(
  {
    requestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BloodRequest",
      required: true,
      index: true,
    },
    actor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null, // null when action is performed automatically by system
    },
    actorRole: {
      type: String,
      enum: ["receiver", "hospital", "donor", "admin", "system"],
      default: "system",
    },
    action: {
      type: String,
      required: true,
      trim: true,
      // Examples:
      // "REQUEST_CREATED", "HOSPITAL_APPROVED", "HOSPITAL_REJECTED",
      // "DONORS_RANKED", "DONOR_NOTIFIED", "DONOR_ACCEPTED",
      // "DONOR_DECLINED", "DONOR_TIMEOUT", "ESCALATED_NEXT_DONOR",
      // "NO_DONORS_AVAILABLE", "MATCHED", "HELD_DONORS_NOTIFIED",
      // "BLOOD_TEST_SCHEDULED", "FINAL_COMPLETED"
    },
    previousStatus: {
      type: String,
      default: null,
    },
    newStatus: {
      type: String,
      default: null,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    note: {
      type: String,
      trim: true,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

auditLogSchema.index({ requestId: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ actor: 1, createdAt: -1 });

module.exports = mongoose.model("AuditLog", auditLogSchema);
