const mongoose = require("mongoose");

const BloodRequest = require("../model/bloodRequestModel");
const DonationRecord = require("../model/donationRecordModel");
const Notification = require("../model/notificationModel");

exports.acceptRequest = async (req, res) => {
  try {
    const requestId = req.params.id;

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(requestId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Request ID",
      });
    }

    const request = await BloodRequest.findById(requestId);

    // Request exists?
    if (!request) {
      return res.status(404).json({
        success: false,
        message: "Request not found",
      });
    }

    // Prevent accepting own request
    if (
      request.requestedBy.toString() === req.user.id
    ) {
      return res.status(400).json({
        success: false,
        message:
          "You cannot accept your own request",
      });
    }

    // Request already processed?
    if (request.status !== "pending") {
      return res.status(400).json({
        success: false,
        message:
          "Request already accepted or completed",
      });
    }

    // Update request
    request.status = "accepted";
    request.acceptedBy = req.user.id;

    await request.save();

    // Create donation record
    const donation =
      await DonationRecord.create({
        donorId: req.user.id,
        receiverId: request.requestedBy,
        requestId: request._id,
        status: "initiated",
        verificationStatus: "pending",
      });

    // Notify receiver
    await Notification.create({
    recipientId: request.requestedBy,
    message: `${req.user.fullName} accepted your blood request and is willing to donate blood.`,
    type: "request_accepted",
  });

    return res.status(200).json({
      success: true,
      message:
        "Request accepted successfully",
      donation,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};