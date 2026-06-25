//hospitalVerifyRequestController.js
const BloodRequest = require("../model/bloodRequestModel");
const Notification = require("../model/notificationModel");
const User = require("../model/userModel");
const asyncHandler = require("express-async-handler");
const mongoose = require("mongoose");


exports.approveBloodRequest = asyncHandler(async (req, res) => {
    const { requestId } = req.params;
    const hospitalId = req.user.id;

    if (!mongoose.Types.ObjectId.isValid(requestId)) {
        return res.status(400).json({
            success: false,
            message: "Invalid request ID",
        });
    }

    const request = await BloodRequest.findById(requestId);

    if (!request) {
        return res.status(404).json({
            success: false,
            message: "Blood request not found",
        });
    }

    if (request.hospitalApproved) {
        return res.status(400).json({
            success: false,
            message: "Request already approved",
        });
    }

    request.hospitalApproved = true;
    request.hospitalApprovedBy = hospitalId;
    request.hospitalApprovedAt = new Date();
    request.assignedHospital = hospitalId;
    request.status = "hospital_approved";

    // Find matching donors with same blood group AND compatible blood groups
    const compatibleBloodGroups = getCompatibleBloodGroups(request.bloodGroup);
    
    // CHANGED: Find and sort donors by distance
    const donors = await User.find({
        role: "donor",
        bloodGroup: { $in: compatibleBloodGroups },
        availabilityStatus: "available",
        "location.coordinates": { $exists: true },
    });

    // Sort by distance if request has coordinates
    let sortedDonors = donors;
    if (request.location && request.location.coordinates) {
        sortedDonors = donors.sort((a, b) => {
            const distA = calculateDistance(
                request.location.coordinates.lat,
                request.location.coordinates.lng,
                a.location?.coordinates?.coordinates?.[1] || 0,
                a.location?.coordinates?.coordinates?.[0] || 0
            );
            const distB = calculateDistance(
                request.location.coordinates.lat,
                request.location.coordinates.lng,
                b.location?.coordinates?.coordinates?.[1] || 0,
                b.location?.coordinates?.coordinates?.[0] || 0
            );
            return distA - distB;
        });
    }

    // CHANGED: Create donor queue instead of notifying all
    if (sortedDonors.length > 0) {
        request.donorQueue = sortedDonors.map((donor, index) => ({
            donor: donor._id,
            sortedIndex: index,
            status: "pending",
        }));
        request.currentDonorIndex = 0;
        request.status = "hospital_approved"; // Wait for admin to send first donor

        // Notify Admin (NOT donors yet)
        await Notification.create({
            recipientId: "ADMIN_ID_HERE", // You'll need admin user ID
            type: "new_approved_request",
            relatedRequest: request._id,
            message: `New approved blood request for ${request.bloodGroup}. ${sortedDonors.length} donors available. Click to send to first donor.`,
            priority: "high",
        });
    }

    await request.save();

    // Notify receiver
    await Notification.create({
        recipientId: request.requestedBy,
        relatedRequest: request._id,
        type: "hospital_approved",
        message: "Your blood request has been approved by the hospital. We are finding donors.",
    });

    return res.status(200).json({
        success: true,
        message: "Blood request approved successfully",
        data: {
            requestId: request._id,
            status: request.status,
            totalDonorsAvailable: sortedDonors.length,
            awaitingAdminAction: true,
        },
    });
});

// Helper function for distance calculation
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in km
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}
//helper func for bloodcompatability
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

exports.rejectBloodRequest = asyncHandler(async (req, res) => {
    const { requestId } = req.params;
    const { rejectionReason } = req.body;

    if (!mongoose.Types.ObjectId.isValid(requestId)) {
        return res.status(400).json({
            success: false,
            message: "Invalid request ID",
        });
    }

    const request = await BloodRequest.findById(requestId);

    if (!request) {
        return res.status(404).json({
            success: false,
            message: "Blood request not found",
        });
    }

    request.status = "rejected";
    request.hospitalApproved = false;
    await request.save();

    await Notification.create({
        recipientId: request.requestedBy,
        relatedRequest: request._id,
        type: "hospital_rejected",
        priority: "normal",
        message: `Your blood request was rejected by the hospital. ${
            rejectionReason || ""
        }`,
    });

    return res.status(200).json({
        success: true,
        message: "Blood request rejected",
    });
});

