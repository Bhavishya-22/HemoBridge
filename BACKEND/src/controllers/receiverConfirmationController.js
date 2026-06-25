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
        .populate("selectedDonor", "fullName")
        .populate("acceptedDonors.donor", "fullName")
        .populate("rejectedDonors.donor", "fullName")
        .populate("backupDonorsOnHold.donor", "fullName");

    if (!request) {
        return res.status(404).json({
            success: false,
            message: "Blood request not found",
        });
    }

    // NEW: Can only send thank you after donation is completed
    if (request.status !== "completed") {
        return res.status(400).json({
            success: false,
            message: "Donation must be completed before sending final thank you. Current status: " + request.status,
        });
    }

    // NEW: Check if blood test was confirmed as successful by receiver
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

    // Record confirmation
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

    // Send thank you to selected donor
    await Notification.create({
        recipientId: request.selectedDonor._id,
        type: "receiver_thank_you",
        relatedRequest: request._id,
        message: `${thankYouMessage} - ${request.requestedBy.fullName}`,
        priority: "high",
    });

    // Send thank you to backup donors
    if (request.backupDonorsOnHold && request.backupDonorsOnHold.length > 0) {
        for (const backupDonor of request.backupDonorsOnHold) {
            await Notification.create({
                recipientId: backupDonor.donor._id,
                type: "receiver_thank_you_backup",
                relatedRequest: request._id,
                message: `Thank you from receiver: ${thankYouMessage} - ${request.requestedBy.fullName}`,
            });
        }
    }

    // Send thank you to accepted but not selected donors
    const notSelectedAccepted = request.acceptedDonors.filter(
        (item) => item.donor._id.toString() !== request.selectedDonor.toString()
    );

    for (const donorItem of notSelectedAccepted) {
        await Notification.create({
            recipientId: donorItem.donor._id,
            type: "receiver_thank_you_accepted",
            relatedRequest: request._id,
            message: `From the receiver: ${thankYouMessage} - ${request.requestedBy.fullName}`,
        });
    }

    // Send thank you to rejected donors
    if (request.rejectedDonors && request.rejectedDonors.length > 0) {
        for (const rejectedDonor of request.rejectedDonors) {
            await Notification.create({
                recipientId: rejectedDonor.donor,
                type: "receiver_thank_you_all",
                relatedRequest: request._id,
                message: `From the receiver: ${thankYouMessage} - ${request.requestedBy.fullName}`,
            });
        }
    }

    return res.status(200).json({
        success: true,
        message: "Final thank you messages sent to all donors. Donation process complete!",
        data: {
            requestId: request._id,
            status: request.status,
            receiverMessage: thankYouMessage,
            notificationsSent: {
                selectedDonor: 1,
                backupDonors: request.backupDonorsOnHold?.length || 0,
                acceptedDonors: notSelectedAccepted.length,
                rejectedDonors: request.rejectedDonors?.length || 0,
            },
        },
    });
});