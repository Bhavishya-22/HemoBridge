/**
 * @deprecated This controller is superseded by hospitalBloodTestController.receiverConfirmSuccess
 * and receiverConfirmFailure. It references a non-existent status "completed" and is not wired
 * to any route. Do not use.
 */

const mongoose = require("mongoose");
const BloodRequest = require("../model/bloodRequestModel");
const Notification = require("../model/notificationModel");
const asyncHandler = require("express-async-handler");

// STEP 7: Receiver sends final thank you messages (only after confirmed success)
exports.sendReceiverConfirmation = asyncHandler(async (req, res) => {
    const { requestId } = req.params;
    const { confirmationMessage } = req.body;
    const receiverId = req.user.id;

    if (!mongoose.Types.ObjectId.isValid(requestId)) {
        return res.status(400).json({
            success: false,
            message: "Invalid request ID",
        });
    }

    const request = await BloodRequest.findById(requestId)
        .populate("confirmedDonor", "fullName")
        .populate("acceptedDonors.donor", "fullName")
        .populate("rejectedDonors.donor", "fullName");

    if (!request) {
        return res.status(404).json({
            success: false,
            message: "Blood request not found",
        });
    }

    if (request.status !== "final_completed") {
        return res.status(400).json({
            success: false,
            message: "Donation must be completed before sending final thank you. Current status: " + request.status,
        });
    }

    if (!request.receiverBloodTestConfirmation || request.receiverBloodTestConfirmation.status !== "success") {
        return res.status(400).json({
            success: false,
            message: "Blood test must be confirmed as successful by receiver first",
        });
    }

    // Verify receiver is the request creator
    if (request.requestedBy.toString() !== receiverId.toString()) {
        return res.status(403).json({
            success: false,
            message: "Only request creator can send confirmation",
        });
    }

    request.receiverConfirmation = {
        confirmedBy: receiverId,
        confirmationMessage: confirmationMessage || "Thank you for saving my life!",
        confirmedAt: new Date(),
    };

    request.status = "final_completed";
    request.finalThankYouSent = true;
    request.finalThankYouSentAt = new Date();

    await request.save();

    const thankYouMessage = confirmationMessage || "Thank you for saving my life!";

    if (request.confirmedDonor) {
        await Notification.create({
            recipientId: request.confirmedDonor._id || request.confirmedDonor,
            type: "receiver_thank_you",
            relatedRequest: request._id,
            message: `${thankYouMessage} - ${request.requestedBy.fullName || "Receiver"}`,
            priority: "high",
        });
    }

    return res.status(200).json({
        success: true,
        message: "Final thank you messages sent to all donors. Donation process complete!",
        data: {
            requestId: request._id,
            status: request.status,
            receiverMessage: thankYouMessage,
        },
    });
});