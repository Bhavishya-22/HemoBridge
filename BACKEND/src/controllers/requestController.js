//requestController.js
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
        status: "pending_hospital_approval"
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
    const user = await User.findById(req.user.id);

    if (!user || user.role !== "donor") {
        return res.status(200).json({
            success: true,
            totalRequests: 0,
            requests: [],
            message: "Only donors can view requests."
        });
    }

    console.log("Donor blood group:", user.bloodGroup);

    const requests = await BloodRequest.find({
        status: {
            $in: ["hospital_approved", "donor_accepted"],
        },
        bloodGroup: {
            $in: getCompatibleBloodGroups(user.bloodGroup),
        },
    });
    // console.log(requests);
    res.status(200).json({
        success: true,
        totalRequests: requests.length,
        requests
    });
});

// Helper function
function getCompatibleBloodGroups(bloodGroup) {
    const compatibility = {
        "O+": ["O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"],
        "O-": ["O-", "A-", "B-", "AB-"],
        "A+": ["A+", "A-", "O+", "O-", "AB+", "AB-"],
        "A-": ["A-", "O-", "AB-"],
        "B+": ["B+", "B-", "O+", "O-", "AB+", "AB-"],
        "B-": ["B-", "O-", "AB-"],
        "AB+": ["AB+", "AB-", "A+", "A-", "B+", "B-", "O+", "O-"],
        "AB-": ["AB-", "A-", "B-", "O-"],
    };
    return compatibility[bloodGroup] || [bloodGroup];
}

exports.myRequests = asyncHandler(async (req, res) => {
    const requests = await BloodRequest.find({
        requestedBy: req.user.id,
    })
        .populate(
            "selectedDonor",
            "fullName email phoneNumber bloodGroup"
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

exports.getHospitalRequests = asyncHandler(async (req, res) => {

    // Get all pending and accepted requests
    const requests = await BloodRequest.find({
        status: { $in: ["pending_hospital_approval"] }
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
            hospitalApproved: request.hospitalApproved,
            selectedDonor: request.selectedDonor,
            bloodTestResult: request.bloodTestResult,
            createdAt: request.createdAt,
        },
    });
});