//hospitalSelectionController.js
const mongoose = require("mongoose");
const BloodRequest = require("../model/bloodRequestModel");
const DonationRecord = require("../model/donationRecordModel");
const Notification = require("../model/notificationModel");
const User = require("../model/userModel");
const asyncHandler = require("express-async-handler");



exports.getHospitalAssignedRequests = asyncHandler(async (req, res) => {
    const hospitalId = req.user.id;

    const requests = await BloodRequest.find({
        assignedHospital: hospitalId
    })
        .populate("requestedBy", "fullName phoneNumber email")
        .populate("selectedDonor", "fullName phoneNumber")
        .sort({ matchedAt: -1 });

    return res.status(200).json({
        success: true,
        totalRequests: requests.length,
        data: requests,
    });
});