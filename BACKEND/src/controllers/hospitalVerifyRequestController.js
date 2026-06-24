//hospitalVerifyRequestController.js
const BloodRequest = require("../model/bloodRequestModel");
const Notification = require("../model/notificationModel");
const User = require("../model/userModel");
const asyncHandler = require("express-async-handler");
const mongoose = require("mongoose");


exports.approveBloodRequest = asyncHandler(async (req, res) => {
    const { requestId } = req.params;
    const hospitalId = req.user.id;

    if (!mongoose.Types.ObjectId.isValid(requestId)) {
        return res.status(400).json({
            success: false,
            message: "Invalid request ID",
        });
    }

    const request = await BloodRequest.findById(requestId);

    if (!request) {
        return res.status(404).json({
            success: false,
            message: "Blood request not found",
        });
    }

    if (request.hospitalApproved) {
        return res.status(400).json({
            success: false,
            message: "Request already approved",
        });
    }

    request.hospitalApproved = true;
    request.hospitalApprovedBy = hospitalId;
    request.hospitalApprovedAt = new Date();
    request.status = "hospital_approved";


    await request.save();

const donors = await User.find({
    role: "donor",
    bloodGroup: request.bloodGroup,
    availabilityStatus: "available",
});

if (donors.length > 0) {

    request.status = "waiting_for_donor";

    for (const donor of donors) {

        request.notifiedDonors.push(donor._id);

        await Notification.create({
            recipientId: donor._id,
            relatedRequest: request._id,
            type: "blood_request",
            message: "A blood donation request requires your attention. Please accept or reject.",
        });
    }

    await request.save();
}

await Notification.create({
    recipientId: request.requestedBy,
    relatedRequest: request._id,
    type: "hospital_approved",
    message: "Your blood request has been approved by the hospital.",
});

    return res.status(200).json({
        success: true,
        message: "Blood request approved successfully",
        data: {
            requestId: request._id,
            status: request.status,
        },
    });
});

exports.rejectBloodRequest = asyncHandler(async (req, res) => {
    const { requestId } = req.params;
    const { rejectionReason } = req.body;

    if (!mongoose.Types.ObjectId.isValid(requestId)) {
        return res.status(400).json({
            success: false,
            message: "Invalid request ID",
        });
    }

    const request = await BloodRequest.findById(requestId);

    if (!request) {
        return res.status(404).json({
            success: false,
            message: "Blood request not found",
        });
    }

    request.status = "rejected";
    request.hospitalApproved = false;
    await request.save();

    await Notification.create({
        recipientId: request.requestedBy,
        relatedRequest: request._id,
        type: "hospital_rejected",
        priority: "normal",
        message: `Your blood request was rejected by the hospital. ${
            rejectionReason || ""
        }`,
    });

    return res.status(200).json({
        success: true,
        message: "Blood request rejected",
    });
});

