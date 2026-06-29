const mongoose = require("mongoose");
const BloodRequest = require("../model/bloodRequestModel");
const Notification = require("../model/notificationModel");
const User = require("../model/userModel");
const asyncHandler = require("express-async-handler");

// Admin sends request to the current donor in queue
exports.sendRequestToNextDonor = asyncHandler(async (req, res) => {
    const { requestId } = req.params;
    const adminId = req.user.id;

    if (!mongoose.Types.ObjectId.isValid(requestId)) {
        return res.status(400).json({
            success: false,
            message: "Invalid request ID",
        });
    }

    const request = await BloodRequest.findById(requestId)
        .populate("donorQueue.donor", "fullName email phoneNumber location");

    if (!request) {
        return res.status(404).json({
            success: false,
            message: "Blood request not found",
        });
    }

    if (request.status !== "hospital_approved") {
        return res.status(400).json({
            success: false,
            message: "Request is not in hospital_approved status",
        });
    }

    // Check if all donors have been tried
    if (request.currentDonorIndex >= request.donorQueue.length) {
        return res.status(400).json({
            success: false,
            message: "All donors have been contacted. No more donors available.",
        });
    }

    const currentDonorData = request.donorQueue[request.currentDonorIndex];
    const donorId = currentDonorData.donor._id;

    // Update queue status
    currentDonorData.status = "notified";
    currentDonorData.notificationSentAt = new Date();

    // Update request status
    request.status = "waiting_for_donor";
    request.selectedDonor = donorId;

    await request.save();

    // Send notification to donor
    const donor = await User.findById(donorId);
    const receiver = await User.findById(request.requestedBy);

    await Notification.create({
        recipientId: donorId,
        relatedRequest: request._id,
        type: "blood_request",
        message: `Blood group ${request.bloodGroup} needed urgently (${request.emergencyLevel}). Patient details: ${receiver.fullName}. Accept to help save a life!`,
        priority: request.emergencyLevel === "critical" ? "high" : "normal",
    });

    // Notify admin
    await Notification.create({
        recipientId: adminId,
        relatedRequest: request._id,
        type: "donor_notified",
        message: `Request sent to ${donor.fullName}. Waiting for response...`,
    });

    return res.status(200).json({
        success: true,
        message: "Request sent to donor",
        data: {
            requestId: request._id,
            donorId: donorId,
            donorName: donor.fullName,
            donorIndex: request.currentDonorIndex + 1,
            totalDonors: request.donorQueue.length,
            status: "waiting_for_donor",
        },
    });
});

// Get pending requests waiting for admin action
exports.getPendingAdminActions = asyncHandler(async (req, res) => {
    const requests = await BloodRequest.find({
        status: "hospital_approved",
        $expr: { $eq: ["$currentDonorIndex", 0] }, // Not yet sent to any donor
    })
        .populate("requestedBy", "fullName bloodGroup location")
        .populate("donorQueue.donor", "fullName location")
        .sort({ emergencyLevel: -1, createdAt: -1 });

    res.status(200).json({
        success: true,
        totalPending: requests.length,
        requests: requests.map((req) => ({
            requestId: req._id,
            receiver: req.requestedBy,
            bloodGroup: req.bloodGroup,
            quantity: req.quantity,
            emergencyLevel: req.emergencyLevel,
            totalDonorsInQueue: req.donorQueue.length,
            status: req.status,
            createdAt: req.createdAt,
        })),
    });
});

// Get active requests (waiting for donor response)
exports.getActiveRequests = asyncHandler(async (req, res) => {
    const requests = await BloodRequest.find({
        status: "waiting_for_donor",
    })
        .populate("requestedBy", "fullName location")
        .populate("selectedDonor", "fullName location")
        .sort({ updatedAt: -1 });

    res.status(200).json({
        success: true,
        totalActive: requests.length,
        requests: requests.map((req) => ({
            requestId: req._id,
            receiver: req.requestedBy,
            selectedDonor: req.selectedDonor,
            bloodGroup: req.bloodGroup,
            emergencyLevel: req.emergencyLevel,
            waitingSince: req.updatedAt,
        })),
    });
});

// Get request details with full donor queue
exports.getRequestWithDonorQueue = asyncHandler(async (req, res) => {
    const { requestId } = req.params;

    const request = await BloodRequest.findById(requestId)
        .populate("requestedBy", "fullName email phoneNumber location")
        .populate("donorQueue.donor", "fullName email phoneNumber location availabilityStatus")
        .populate("selectedDonor", "fullName email phoneNumber");

    if (!request) {
        return res.status(404).json({
            success: false,
            message: "Request not found",
        });
    }

    res.status(200).json({
        success: true,
        data: {
            request: {
                requestId: request._id,
                receiver: request.requestedBy,
                bloodGroup: request.bloodGroup,
                quantity: request.quantity,
                emergencyLevel: request.emergencyLevel,
                status: request.status,
                hospitalApprovedAt: request.hospitalApprovedAt,
            },
            donorQueue: request.donorQueue.map((item, index) => ({
                queuePosition: index + 1,
                donor: item.donor,
                status: item.status,
                notificationSentAt: item.notificationSentAt,
                isCurrentDonor: index === request.currentDonorIndex,
            })),
            selectedDonor: request.selectedDonor,
            currentDonorIndex: request.currentDonorIndex,
        },
    });
});