// donationController.js
const mongoose = require("mongoose");
const DonationRecord = require("../model/donationRecordModel");
const BloodRequest = require("../model/bloodRequestModel");
const Notification = require("../model/notificationModel");
const User = require("../model/userModel");
const asyncHandler = require("express-async-handler");
const { REQUEST_STATUSES } = require("../utils/stateMachine");
const { promoteNearestBackupDonor } = require("../utils/donorSelectionService");

exports.getDonationStatus = asyncHandler(async (req, res) => {
    const { donationId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(donationId)) {
        return res.status(400).json({
            success: false,
            message: "Invalid donation ID format",
        });
    }

    const donation = await DonationRecord.findById(donationId)
        .populate("donorId", "fullName email phoneNumber bloodGroup")
        .populate("receiverId", "fullName email phoneNumber")
        .populate("hospitalId", "fullName hospitalName hospitalPhone")
        .populate("requestId", "bloodGroup quantity emergencyLevel");

    if (!donation) {
        return res.status(404).json({
            success: false,
            message: "Donation record not found",
        });
    }

    return res.status(200).json({
        success: true,
        data: {
            donationId: donation._id,
            donor: donation.donorId,
            receiver: donation.receiverId,
            hospital: donation.hospitalId,
            request: donation.requestId,
            status: donation.status,
            verificationStatus: donation.verificationStatus,
            timeline: {
                initiatedAt: donation.initiatedAt,
                completedAt: donation.completedAt,
                verifiedAt: donation.verifiedAt,
            },
            notes: {
                donorNotes: donation.donorNotes,
                hospitalVerificationNotes: donation.hospitalVerificationNotes,
            },
        },
    });
});

exports.getDonorDonations = asyncHandler(async (req, res) => {
    const donorId = req.user.id;

    const donations = await DonationRecord.find({ donorId })
        .populate("receiverId", "fullName email")
        .populate("requestId", "bloodGroup quantity")
        .populate("hospitalId", "hospitalName")
        .sort({ createdAt: -1 });

    return res.status(200).json({
        success: true,
        totalDonations: donations.length,
        data: donations,
    });
});

exports.getReceiverDonations = asyncHandler(async (req, res) => {
    const receiverId = req.user.id;

    const donations = await DonationRecord.find({ receiverId })
        .populate("donorId", "fullName email phoneNumber")
        .populate("requestId", "bloodGroup quantity")
        .populate("hospitalId", "hospitalName")
        .sort({ createdAt: -1 });

    return res.status(200).json({
        success: true,
        totalDonations: donations.length,
        data: donations,
    });
});

exports.getHospitalDonations = asyncHandler(async (req, res) => {
    const hospitalId = req.user.id;

    const donations = await DonationRecord.find({ hospitalId })
        .populate("donorId", "fullName email phoneNumber bloodGroup")
        .populate("receiverId", "fullName email phoneNumber")
        .populate("requestId", "bloodGroup quantity emergencyLevel")
        .sort({ createdAt: -1 });

    return res.status(200).json({
        success: true,
        totalDonations: donations.length,
        data: donations,
    });
});

exports.verifyDonation = asyncHandler(async (req, res) => {
    const { donationId } = req.params;
    const { isVerified, verificationNotes } = req.body;
    const hospitalId = req.user.id;

    if (!mongoose.Types.ObjectId.isValid(donationId)) {
        return res.status(400).json({
            success: false,
            message: "Invalid donation ID format",
        });
    }

    const donation = await DonationRecord.findById(donationId);

    if (!donation) {
        return res.status(404).json({
            success: false,
            message: "Donation record not found",
        });
    }

    // Verify hospital authorization
    if (donation.hospitalId.toString() !== hospitalId) {
        return res.status(403).json({
            success: false,
            message: "Only assigned hospital can verify donation",
        });
    }

    if (isVerified) {
        // Blood test passed
        donation.status = "completed";
        donation.verificationStatus = "verified";
        donation.verifiedAt = new Date();
        donation.verifiedBy = hospitalId;
        donation.hospitalVerificationNotes =
            verificationNotes || "Blood donation verified successfully";

        await donation.save();

        // Update request - fix enum bug: status is final_completed
        await BloodRequest.findByIdAndUpdate(
            donation.requestId,
            {
                status: REQUEST_STATUSES.FINAL_COMPLETED,
                bloodTestResult: "accepted",
                completedAt: new Date(),
            }
        );

        // Make donor available again
        await User.findByIdAndUpdate(
            donation.donorId,
            {
                availabilityStatus: "available",
            }
        );

        // Notify donor
        await Notification.create({
            recipientId: donation.donorId,
            type: "blood_test_accepted",
            relatedDonation: donation._id,
            message:
                "Your blood donation has been accepted and verified. Thank you for helping save a life.",
        });

        // Notify receiver
        await Notification.create({
            recipientId: donation.receiverId,
            type: "request_completed",
            relatedDonation: donation._id,
            message:
                "A suitable blood donor has been verified and your request has been completed successfully.",
        });

        return res.status(200).json({
            success: true,
            message: "Blood donation verified successfully",
            data: {
                donationId: donation._id,
                status: donation.status,
                verificationStatus: donation.verificationStatus,
            },
        });

    } else {
        // Blood test failed
        donation.status = "rejected";
        donation.verificationStatus = "rejected";
        donation.verifiedAt = new Date();
        donation.verifiedBy = hospitalId;
        donation.hospitalVerificationNotes =
            verificationNotes || "Blood donation rejected";

        await donation.save();

        // Make donor available again
        await User.findByIdAndUpdate(
            donation.donorId,
            {
                availabilityStatus: "available",
            }
        );

        // Notify donor
        await Notification.create({
            recipientId: donation.donorId,
            type: "blood_test_rejected",
            relatedDonation: donation._id,
            message:
                verificationNotes ||
                "Your blood donation was not accepted after testing.",
        });

        // Delegate backup promotion to centralized service
        const promotionResult = await promoteNearestBackupDonor(
            donation.requestId,
            donation.donorId,
            verificationNotes || "Blood donation rejected by hospital during verification"
        );

        return res.status(200).json({
            success: true,
            message: "Blood donation rejected. " + promotionResult.message,
            data: {
                donationId: donation._id,
                status: donation.status,
                verificationStatus: donation.verificationStatus,
                nextDonor: promotionResult.nextDonor ? promotionResult.nextDonor.fullName : null,
                promoted: promotionResult.promoted,
            },
        });
    }
});