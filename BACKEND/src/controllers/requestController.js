const mongoose = require("mongoose");
const DonationRecord = require("../model/donationRecordModel");
const BloodRequest = require("../model/bloodRequestModel");
const Notification = require("../model/notificationModel");
const User = require("../model/userModel");
const asyncHandler = require("express-async-handler");

exports.createRequest = asyncHandler(async (req, res) => {
    const { bloodGroup, quantity, emergencyLevel, location, hospitalName, description } = req.body;
    const user = await User.findById(req.user.id);

    // Check if user can create request
    if (user.role === "hospital" && !user.hospitalVerified) {
        return res.status(403).json({
            success: false,
            message: "Hospital not verified. Cannot create requests."
        });
    }

    if (user.role === "hospital") {
        return res.status(403).json({
            success: false,
            message: "Hospitals cannot create requests"
        });
    }

    if (!bloodGroup || !quantity) {
        return res.status(400).json({
            success: false,
            message: "Blood group and quantity are required"
        });
    }

    const request = await BloodRequest.create({
        requestedBy: req.user.id,
        bloodGroup,
        quantity,
        emergencyLevel: emergencyLevel || "medium",
        location,
        hospitalName,
        description,
    });

    res.status(201).json({
        success: true,
        message: "Blood request created successfully",
        data: {
            requestId: request._id,
            bloodGroup: request.bloodGroup,
            quantity: request.quantity,
            emergencyLevel: request.emergencyLevel,
            status: request.status,
        },
    });
});

exports.viewRequests = asyncHandler(async (req, res) => {
    const requests = await BloodRequest.find({ status: "pending" })
        .populate("requestedBy", "fullName bloodGroup location phoneNumber")
        .sort({ emergencyLevel: -1, createdAt: -1 });

    res.status(200).json({
        success: true,
        totalRequests: requests.length,
        requests,
    });
});

exports.myRequests = asyncHandler(async (req, res) => {
    const requests = await BloodRequest.find({
        requestedBy: req.user.id,
    })
        .populate(
            "selectedDonor",
            "fullName email phoneNumber bloodGroup"
        )
        .populate(
            "acceptedDonors.donor",
            "fullName email phoneNumber bloodGroup location"
        )
        .populate(
            "assignedHospital",
            "fullName hospitalName hospitalPhone"
        )
        .sort({ createdAt: -1 });

    res.status(200).json({
        success: true,
        totalRequests: requests.length,
        requests,
    });
});

exports.viewAcceptedDonors = asyncHandler(async (req, res) => {
    const { requestId } = req.params;
    const receiverId = req.user.id;

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

    // Only receiver can view
    if (request.requestedBy.toString() !== receiverId) {
        return res.status(403).json({
            success: false,
            message: "Only request creator can view accepted donors",
        });
    }

    await request.populate({
        path: "acceptedDonors.donor",
        select: "fullName email phoneNumber bloodGroup location age weight",
    });

    return res.status(200).json({
        success: true,
        data: {
            requestId: request._id,
            bloodGroup: request.bloodGroup,
            quantity: request.quantity,
            emergencyLevel: request.emergencyLevel,
            acceptedCount: request.acceptedCount,
            selectedDonor: request.selectedDonor || null,
            requestStatus: request.status,
            acceptedDonors: request.acceptedDonors
                .filter(d => d.status === "pending")
                .map((d) => ({
                    donorId: d.donor._id,
                    donorName: d.donor.fullName,
                    email: d.donor.email,
                    phoneNumber: d.donor.phoneNumber,
                    bloodGroup: d.donor.bloodGroup,
                    location: d.donor.location,
                    age: d.donor.age,
                    weight: d.donor.weight,
                    acceptedAt: d.acceptedAt,
                })),
        },
    });
});

exports.getHospitalRequests = asyncHandler(async (req, res) => {
    const hospitalId = req.user.id;

    // Get all pending and accepted requests
    const requests = await BloodRequest.find({
        status: { $in: ["pending", "accepted"] }
    })
        .populate("requestedBy", "fullName email phoneNumber location")
        .sort({ emergencyLevel: -1, createdAt: -1 });

    res.status(200).json({
        success: true,
        totalRequests: requests.length,
        requests,
    });
});

exports.getRequestDetail = asyncHandler(async (req, res) => {
    const { requestId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(requestId)) {
        return res.status(400).json({
            success: false,
            message: "Invalid request ID format",
        });
    }

    const request = await BloodRequest.findById(requestId)
        .populate("requestedBy", "fullName email phoneNumber location age bloodGroup")
        .populate({
            path: "acceptedDonors.donor",
            select: "fullName email phoneNumber bloodGroup location age weight diseases"
        });

    if (!request) {
        return res.status(404).json({
            success: false,
            message: "Blood request not found",
        });
    }

    return res.status(200).json({
        success: true,
        data: {
            requestId: request._id,
            receiver: request.requestedBy,
            bloodGroup: request.bloodGroup,
            quantity: request.quantity,
            emergencyLevel: request.emergencyLevel,
            status: request.status,
            acceptedCount: request.acceptedCount,
            acceptedDonors: request.acceptedDonors
                .filter(d => d.status === "pending")
                .map((d) => ({
                    donorId: d.donor._id,
                    donorDetails: d.donor,
                    acceptedAt: d.acceptedAt,
                })),
            createdAt: request.createdAt,
        },
    });
});