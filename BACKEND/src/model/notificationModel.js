const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    recipientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    message: String,

    type: {
      type: String,
      enum: [
        "blood_request",
        "donation_update",
        "request_accepted",
        "donation_verified",
      ],
    },

    status: {
      type: String,
      enum: [
        "sent",
        "delivered",
        "read",
      ],
      default: "sent",
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model(
  "Notification",
  notificationSchema
);


