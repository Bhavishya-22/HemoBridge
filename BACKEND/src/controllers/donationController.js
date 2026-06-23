const mongoose = require("mongoose");
const DonationRecord = require("../model/donationRecordModel");
const BloodRequest = require("../model/bloodRequestModel");
const Notification = require("../model/notificationModel");
const User = require("../model/userModel");
const asyncHandler = require("express-async-handler");

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

exports.initiateDonation = asyncHandler(async (req, res) => {
    const { donationId } = req.params;
    const { donorNotes } = req.body;
    const donorId = req.user.id;

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

    // Verify donor authorization
    if (donation.donorId.toString() !== donorId) {
        return res.status(403).json({
            success: false,
            message: "Only assigned donor can initiate donation",
        });
    }

    // Check status
    if (donation.status !== "matched") {
        return res.status(400).json({
            success: false,
            message: "Donation cannot be initiated in current status",
        });
    }

    // Update donation
    donation.status = "initiated";
    donation.donationDate = new Date();
    donation.donorNotes = donorNotes || "";
    await donation.save();

    // Get user details
    const donor = await User.findById(donorId).select("fullName");

    // Notify hospital
    await Notification.create({
        recipientId: donation.hospitalId,
        message: `${donor.fullName} has initiated the donation process.`,
        type: "donation_initiated",
        relatedDonation: donationId,
    });

    return res.status(200).json({
        success: true,
        message: "Donation initiated successfully",
        data: {
            donationId: donation._id,
            status: "initiated",
            donationDate: donation.donationDate,
        },
    });
});

exports.completeDonation = asyncHandler(async (req, res) => {
    const { donationId } = req.params;
    const donorId = req.user.id;

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

    // Verify donor
    if (donation.donorId.toString() !== donorId) {
        return res.status(403).json({
            success: false,
            message: "Only assigned donor can complete donation",
        });
    }

    if (donation.status !== "initiated") {
        return res.status(400).json({
            success: false,
            message: "Donation can only be completed from initiated status",
        });
    }

    // Update donation
    donation.status = "completed";
    donation.completedAt = new Date();
    await donation.save();

    // Get user details
    const donor = await User.findById(donorId).select("fullName");

    // Notify hospital for final verification
    await Notification.create({
        recipientId: donation.hospitalId,
        message: `${donor.fullName} has completed the donation. Please verify and confirm.`,
        type: "donation_completed",
        relatedDonation: donationId,
    });

    return res.status(200).json({
        success: true,
        message: "Donation marked as completed. Awaiting hospital verification.",
        data: {
            donationId: donation._id,
            status: "completed",
            completedAt: donation.completedAt,
        },
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

    // Verify authorization
    if (donation.hospitalId.toString() !== hospitalId) {
        return res.status(403).json({
            success: false,
            message: "Only assigned hospital can verify donation",
        });
    }

    if (donation.status !== "completed") {
        return res.status(400).json({
            success: false,
            message: "Only completed donations can be verified",
        });
    }

    if (isVerified) {
        // Success verification
        donation.verificationStatus = "verified";
        donation.verifiedAt = new Date();
        donation.verifiedBy = hospitalId;
        donation.hospitalVerificationNotes = verificationNotes || "Donation verified successfully";
        await donation.save();

        // Update blood request
        await BloodRequest.findByIdAndUpdate(donation.requestId, {
            status: "completed",
            completedAt: new Date(),
        });

        // Get user details
        const donor = await User.findById(donation.donorId).select("fullName");
        const receiver = await User.findById(donation.receiverId).select("fullName");

        // Notify donor
        await Notification.create({
            recipientId: donation.donorId,
            message: `Your donation has been verified and confirmed. Thank you for saving a life!`,
            type: "donation_verified",
            relatedDonation: donationId,
        });

        // Notify receiver - MAIN SUCCESS NOTIFICATION
        await Notification.create({
            recipientId: donation.receiverId,
            message: `Your blood donation from ${donor.fullName} has been successfully completed and verified. You will receive the blood shortly.`,
            type: "request_completed",
            relatedDonation: donationId,
        });

        return res.status(200).json({
            success: true,
            message: "Donation verified successfully",
            data: {
                donationId: donation._id,
                status: "verified",
                verifiedAt: donation.verifiedAt,
            },
        });
    } else {
        // Rejection
        donation.verificationStatus = "rejected";
        donation.verifiedAt = new Date();
        donation.verifiedBy = hospitalId;
        donation.hospitalVerificationNotes =
            verificationNotes || "Donation rejected";
        await donation.save();

        // Get user details
        const donor = await User.findById(donation.donorId).select("fullName");

        // Notify donor
        await Notification.create({
            recipientId: donation.donorId,
            message: `Your donation was not verified. Reason: ${verificationNotes || "Medical reasons"}`,
            type: "donation_rejected",
            relatedDonation: donationId,
        });

        // Notify receiver
        await Notification.create({
            recipientId: donation.receiverId,
            message: `The blood donation could not be verified. A new donor will be selected.`,
            type: "donation_rejected",
            relatedDonation: donationId,
        });

        // Reset request to pending for new donor selection
        await BloodRequest.findByIdAndUpdate(donation.requestId, {
            status: "pending",
            selectedDonor: null,
            assignedHospital: null,
        });

        return res.status(200).json({
            success: true,
            message: "Donation rejected",
            data: {
                donationId: donation._id,
                status: "rejected",
            },
        });
    }
});