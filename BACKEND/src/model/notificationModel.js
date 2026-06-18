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


notificationSchema.methods.markAsRead = async function () {
  this.status = "read";
  return await this.save();
};