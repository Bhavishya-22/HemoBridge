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
    if (request.status === "donor_accepted") {
    return res.status(400).json({
        success: false,
        message: "Request already accepted by a donor",
    });
    }
    if (
        !request.notifiedDonors ||
        !request.notifiedDonors.some(
            donor =>
                donor._id &&
                donor._id.toString() === donorId.toString()
        )
    ) {
        return res.status(403).json({
            success: false,
            message: "You are not notified for this request",
        });
    }
    if (request.status === "completed" ||request.status === "cancelled") {
        return res.status(400).json({
            success: false,
            message: `Cannot accept request with status ${request.status}`,
        });
    }

    request.selectedDonor = donorId;
    request.status = "donor_accepted";

    await request.save();

    const donation = await DonationRecord.create({
        donorId,
        receiverId: request.requestedBy,
        requestId: request._id,
        hospitalId: request.hospitalApprovedBy,
        status: "donor_accepted",
        verificationStatus: "pending",
    });

    const donor = await User.findById(donorId).select("fullName");

    await Notification.create({
        recipientId: request.requestedBy,
        type: "donor_accepted",
        relatedRequest: request._id,
        relatedDonation: donation._id,
        message: `${donor.fullName} accepted your blood request.`,
    });

    if (request.assignedHospital) {
        await Notification.create({
            recipientId: request.assignedHospital,
            type: "donor_accepted",
            relatedRequest: request._id,
            relatedDonation: donation._id,
            message: `${donor.fullName} accepted the blood donation request.`,
        });
    }

    return res.status(200).json({
        success: true,
        message: "Request accepted successfully",
        data: {
            requestId: request._id,
            donationId: donation._id,
            status: request.status,
        },
    });
});

exports.rejectRequest = asyncHandler(async (req, res) => {
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
    if (
        !request.notifiedDonors ||
        !request.notifiedDonors.some(
            id => id.toString() === donorId.toString()
        )
    ) {
        return res.status(403).json({
            success: false,
            message: "You are not notified for this request",
        });
    }

    request.selectedDonor = null;
    request.status = "waiting_for_donor";

    await request.save();

    if (request.assignedHospital) {
        await Notification.create({
            recipientId: request.assignedHospital,
            type: "donor_rejected",
            relatedRequest: request._id,
            message:
                "Assigned donor rejected the request. Please allocate another donor.",
        });
    }

    return res.status(200).json({
        success: true,
        message: "Request rejected successfully",
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