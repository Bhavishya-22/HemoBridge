const mongoose = require("mongoose");

const bloodRequestSchema = new mongoose.Schema(
  {
    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    bloodGroup: {
      type: String,
      required: true,
    },

    quantity: {
      type: Number,
      required: true,
    },

    emergencyLevel: {
      type: String,
      enum: ["normal", "urgent", "critical"],
      default: "normal",
    },

    status: {
      type: String,
      enum: ["pending", "accepted", "completed", "cancelled"],
      default: "pending",
    },

    acceptedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model(
  "BloodRequest",
  bloodRequestSchema
);

bloodRequestSchema.pre("save", function (next) {
  // Prevent users from accepting their own blood request
  if (this.requestedBy.equals(this.acceptedBy)) {
    return next(new Error("You cannot accept your own blood request."));
  }
  next();
});