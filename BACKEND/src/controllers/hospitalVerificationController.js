//hospitalVerificationController.js
const mongoose = require("mongoose");
const User = require("../model/userModel");
const Notification = require("../model/notificationModel");
const asyncHandler = require("express-async-handler");

exports.requestHospitalVerification = asyncHandler(async (req, res) => {
    const {
        hospitalName,
        registrationNumber,
        hospitalAddress,
        hospitalPhone,
    } = req.body;
    const userId = req.user.id;

    // Validation
    if (!hospitalName || !registrationNumber || !hospitalAddress || !hospitalPhone) {
        return res.status(400).json({
            success: false,
            message: "All hospital details are required"
        });
    }

    const user = await User.findById(userId);

    if (!user) {
        return res.status(404).json({
            success: false,
            message: "User not found"
        });
    }

    if (user.role !== "hospital") {
        return res.status(403).json({
            success: false,
            message: "Only users with hospital role can request verification"
        });
    }

    // Check if already verified
    if (user.hospitalVerified) {
        return res.status(400).json({
            success: false,
            message: "Hospital already verified"
        });
    }

    // Check if already pending
    if (user.hospitalVerificationStatus === "pending") {
        return res.status(400).json({
            success: false,
            message: "Hospital verification already pending"
        });
    }

    const updatePayload = {
        hospitalName,
        registrationNumber,
        hospitalAddress,
        hospitalPhone,
        hospitalVerificationStatus: "pending",
    };
    if (req.body.location) {
        updatePayload.location = req.body.location;
    }

    // Update user with hospital details
    const updatedUser = await User.findByIdAndUpdate(
        userId,
        updatePayload,
        { new: true }
    ).select("-password -refreshToken");

    return res.status(200).json({
        success: true,
        message: "Hospital verification request submitted. Admin will review shortly.",
        data: {
            userId: updatedUser._id,
            hospitalName: updatedUser.hospitalName,
            registrationNumber: updatedUser.registrationNumber,
            verificationStatus: updatedUser.hospitalVerificationStatus,
        },
    });
});

exports.verifyHospital = asyncHandler(async (req, res) => {
    const { hospitalId, isApproved, rejectionNotes } = req.body;
    const adminId = req.user.id;

    // Validation
    if (!mongoose.Types.ObjectId.isValid(hospitalId)) {
        return res.status(400).json({
            success: false,
            message: "Invalid hospital ID format",
        });
    }

    if (!isApproved && !rejectionNotes) {
        return res.status(400).json({
            success: false,
            message: "Rejection notes are required when rejecting"
        });
    }

    const hospital = await User.findById(hospitalId);

    if (!hospital) {
        return res.status(404).json({
            success: false,
            message: "Hospital not found",
        });
    }

    if (hospital.role !== "hospital") {
        return res.status(400).json({
            success: false,
            message: "User is not a hospital",
        });
    }

    if (isApproved) {
        // Approve hospital
        hospital.hospitalVerificationStatus = "verified";
        hospital.hospitalVerified = true;
        hospital.hospitalVerifiedBy = adminId;
        hospital.hospitalVerifiedAt = new Date();
        await hospital.save();

        // Notify hospital
        await Notification.create({
            recipientId: hospitalId,
            message: "Congratulations! Your hospital has been verified and approved. You can now manage blood requests and select donors.",
            type: "blood_request",
        });

        return res.status(200).json({
            success: true,
            message: "Hospital approved successfully",
            data: {
                hospitalId: hospital._id,
                hospitalName: hospital.hospitalName,
                verificationStatus: hospital.hospitalVerificationStatus,
            },
        });
    } else {
        // Reject hospital
        hospital.hospitalVerificationStatus = "rejected";
        hospital.hospitalVerificationNotes = rejectionNotes;
        await hospital.save();

        // Notify hospital
        await Notification.create({
            recipientId: hospitalId,
            message: `Your hospital verification was rejected. Reason: ${rejectionNotes}. Please contact admin for more details.`,
            type: "general",
        });

        return res.status(200).json({
            success: true,
            message: "Hospital rejected",
            data: {
                hospitalId: hospital._id,
                verificationStatus: hospital.hospitalVerificationStatus,
                rejectionReason: rejectionNotes,
            },
        });
    }
});

exports.getHospitalVerificationRequests = asyncHandler(async (req, res) => {
    const hospitals = await User.find({
        role: "hospital",
        hospitalVerificationStatus: "pending",
    }).select(
        "fullName email phoneNumber hospitalName registrationNumber hospitalAddress hospitalPhone createdAt"
    );

    return res.status(200).json({
        success: true,
        totalRequests: hospitals.length,
        data: hospitals,
    });
});

exports.getAllHospitals = asyncHandler(async (req, res) => {
    const hospitals = await User.find({
        role: "hospital",
        hospitalVerified: true,
    }).select(
        "fullName email phoneNumber hospitalName registrationNumber hospitalAddress hospitalPhone location hospitalVerified hospitalVerificationStatus"
    );

    return res.status(200).json({
        success: true,
        totalHospitals: hospitals.length,
        data: hospitals,
    });
});

exports.getHospitalDetails = asyncHandler(async (req, res) => {
    const { hospitalId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(hospitalId)) {
        return res.status(400).json({
            success: false,
            message: "Invalid hospital ID format",
        });
    }

    const hospital = await User.findById(hospitalId).select(
        "hospitalName hospitalAddress hospitalPhone registrationNumber"
    );

    if (!hospital || hospital.role !== "hospital") {
        return res.status(404).json({
            success: false,
            message: "Hospital not found",
        });
    }

    if (!hospital.hospitalVerified) {
        return res.status(403).json({
            success: false,
            message: "This hospital is not verified",
        });
    }

    return res.status(200).json({
        success: true,
        data: hospital,
    });
});