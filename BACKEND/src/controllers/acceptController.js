const mongoose = require("mongoose");
const BloodRequest = require("../model/bloodRequestModel");
const DonationRecord = require("../model/donationRecordModel");
const Notification = require("../model/notificationModel");
const User = require("../model/userModel");
const asyncHandler = require("express-async-handler");

exports.acceptRequest = asyncHandler(async (req, res) => {
    const { requestId } = req.params;
    const donorId = req.user.id;

    if (!mongoose.Types.ObjectId.isValid(requestId)) {
        return res.status(400).json({
            success: false,
            message: "Invalid request ID format",
        });
    }

    const request = await BloodRequest.findById(requestId);
    if (!request) {
        return res.status(404).json({
            success: false,
            message: "Blood request not found",
        });
    }

    // Allow acceptance in both pending and accepted status
    if (request.status === "matched" || request.status === "completed" || request.status === "cancelled") {
        return res.status(400).json({
            success: false,
            message: `Cannot accept request with status: ${request.status}`,
        });
    }

    if (request.requestedBy.toString() === donorId) {
        return res.status(400).json({
            success: false,
            message: "You cannot accept your own request",
        });
    }

    const alreadyAccepted = request.acceptedDonors?.some(
        (d) => d?.donor?.toString() === donorId.toString()
    );

    if (alreadyAccepted) {
        return res.status(409).json({
            success: false,
            message: "You have already accepted this request",
        });
    }

    // Add donor to accepted list
    request.acceptedDonors.push({
        donor: donorId,
        status: "pending",
        acceptedAt: new Date(),
    });

    request.acceptedCount = (request.acceptedCount || 0) + 1;
    
    // Update status to "accepted" if it's still pending
    if (request.status === "pending") {
        request.status = "accepted";
    }

    await request.save();

    // Get donor details
    const donor = await User.findById(donorId).select("fullName");
    const receiver = await User.findById(request.requestedBy).select("fullName");

    // Notify receiver about new acceptance
    await Notification.create({
        recipientId: request.requestedBy,
        message: `${donor.fullName} has offered to donate blood for your request (${request.bloodGroup}, ${request.quantity} units).`,
        type: "donors_accepted",
        relatedRequest: requestId,
        relatedUser: donorId,
    });

    // Notify all verified hospitals
    const hospitals = await User.find({ role: "hospital", hospitalVerified: true });
    for (const hospital of hospitals) {
        await Notification.create({
            recipientId: hospital._id,
            message: `${donor.fullName} accepted blood request from ${receiver.fullName} (${request.bloodGroup}, ${request.quantity} units). Total acceptances: ${request.acceptedCount}`,
            type: "donors_accepted",
            relatedRequest: requestId,
            relatedUser: donorId,
        });
    }

    return res.status(200).json({
        success: true,
        message: "Request accepted successfully. Hospital will review donors.",
        data: {
            requestId: request._id,
            status: request.status,
            acceptedCount: request.acceptedCount,
        },
    });
});

exports.getDonorAcceptances = asyncHandler(async (req, res) => {
    const donorId = req.user.id;

    const acceptances = await BloodRequest.find({
        "acceptedDonors.donor": donorId
    })
        .populate("requestedBy", "fullName phoneNumber location")
        .populate({
            path: "acceptedDonors",
            match: { "donor": donorId },
        });

    return res.status(200).json({
        success: true,
        totalAcceptances: acceptances.length,
        data: acceptances,
    });
});