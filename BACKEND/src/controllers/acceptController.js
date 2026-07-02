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

    // Allow donors to accept when request is either hospital approved
    // or already has other donor acceptances
    const allowedStatuses = [
        "hospital_approved",
        "donor_accepted",
    ];

    if (!allowedStatuses.includes(request.status)) {
        return res.status(403).json({
            success: false,
            message: "This request is not open for donor acceptance",
        });
    }

    // Check if this donor already accepted
    const alreadyAccepted = request.acceptedDonors.some(
        (item) => item.donor.toString() === donorId.toString()
    );

    if (alreadyAccepted) {
        return res.status(400).json({
            success: false,
            message: "You already accepted this request",
        });
    }

    // Add donor to accepted list
    request.acceptedDonors.push({
        donor: donorId,
        acceptedAt: new Date(),
        status: "accepted",
    });

    // Change status only on first acceptance
    if (request.status === "hospital_approved") {
        request.status = "donor_accepted";
    }

    await request.save();

    const donor = await User.findById(donorId).select(
        "fullName phoneNumber"
    );

    // Notify receiver
    await Notification.create({
        recipientId: request.requestedBy,
        type: "donor_accepted",
        relatedRequest: request._id,
        message: `${donor.fullName} has accepted your blood request!`,
        priority: "high",
    });

    // Notify hospital
    if (request.assignedHospital) {
        await Notification.create({
            recipientId: request.assignedHospital,
            type: "donor_accepted",
            relatedRequest: request._id,
            message: `${donor.fullName} accepted the blood request.`,
            priority: "high",
        });
    }

    return res.status(200).json({
        success: true,
        message: "Request accepted successfully",
        data: {
            requestId: request._id,
            status: request.status,
            donorName: donor.fullName,
            totalAcceptances: request.acceptedDonors.length,
        },
    });
});

exports.rejectRequest = asyncHandler(async (req, res) => {
    const { requestId } = req.params;
    const { rejectionReason } = req.body;
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

    // Check if request is in hospital_approved status
    if (request.status !== "hospital_approved") {
        return res.status(403).json({
            success: false,
            message: "This request is not open for acceptance",
        });
    }

    // Add to rejected donors list
    request.rejectedDonors.push({
        donor: donorId,
        reason: rejectionReason || "Donor rejected",
        rejectedAt: new Date(),
    });

    // Keep status as hospital_approved so other donors can see it
    await request.save();

    const donor = await User.findById(donorId).select("fullName");

    // Notify hospital about rejection
    await Notification.create({
        recipientId: request.assignedHospital,
        type: "donor_rejected",
        relatedRequest: request._id,
        message: `${donor.fullName} rejected the blood request.`,
    });

    return res.status(200).json({
        success: true,
        message: "Request rejected",
        data: {
            requestId: request._id,
            status: request.status,
        },
    });
});

exports.getDonorAcceptances = asyncHandler(async (req, res) => {
    const donorId = req.user.id;

    const requests = await BloodRequest.find({
        selectedDonor: donorId,
    })
        .populate(
            "requestedBy",
            "fullName phoneNumber location bloodGroup"
        )
        .populate(
            "assignedHospital",
            "hospitalName hospitalPhone"
        )
        .sort({ createdAt: -1 });

    return res.status(200).json({
        success: true,
        totalRequests: requests.length,
        data: requests,
    });
});