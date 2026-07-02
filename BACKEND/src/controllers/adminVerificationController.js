const mongoose = require("mongoose");
const BloodRequest = require("../model/bloodRequestModel");
const DonationRecord = require("../model/donationRecordModel");
const Notification = require("../model/notificationModel");
const User = require("../model/userModel");
const asyncHandler = require("express-async-handler");

// STEP 4: Admin views all donors who accepted
exports.getAcceptedDonors = asyncHandler(async (req, res) => {
    const { requestId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(requestId)) {
        return res.status(400).json({
            success: false,
            message: "Invalid request ID",
        });
    }

    const request = await BloodRequest.findById(requestId)
        .populate("acceptedDonors.donor", "fullName email phoneNumber location bloodGroup")
        .populate("requestedBy", "fullName");

    if (!request) {
        return res.status(404).json({
            success: false,
            message: "Blood request not found",
        });
    }
    console.log(request.status);
    if (request.status !== "donor_accepted" && request.status !=="admin_verified") {
        return res.status(400).json({
            success: false,
            message: "Request has no acceptances yet",
        });
    }

    return res.status(200).json({
        success: true,
        data: {
            requestId: request._id,
            receiver: request.requestedBy,
            bloodGroup: request.bloodGroup,
            quantity: request.quantity,
            totalAcceptances: request.acceptedDonors.length,
            acceptedDonors: request.acceptedDonors.map((item) => ({
                donorId: item.donor._id,
                donor: item.donor,
                acceptedAt: item.acceptedAt,
                status:item.status,
            })),
        },
    });
});

// STEP 4: Admin selects ONE donor to proceed
exports.selectDonorForVerification = asyncHandler(async (req, res) => {
    const { requestId } = req.params;
    const { selectedDonorId } = req.body;
    const adminId = req.user.id;

    if (!mongoose.Types.ObjectId.isValid(requestId)) {
        return res.status(400).json({
            success: false,
            message: "Invalid request ID",
        });
    }

    const request = await BloodRequest.findById(requestId)
        .populate("acceptedDonors.donor", "fullName phoneNumber");

    if (!request) {
        return res.status(404).json({
            success: false,
            message: "Blood request not found",
        });
    }

    if (request.status !== "donor_accepted") {
        return res.status(400).json({
            success: false,
            message: "Request must have acceptances to select from",
        });
    }

    // Verify donor is in accepted list
    const selectedDonor = request.acceptedDonors.find(
        (item) => item.donor._id.toString() === selectedDonorId.toString()
    );

    if (!selectedDonor) {
        return res.status(400).json({
            success: false,
            message: "This donor has not accepted this request",
        });
    }

    // STEP 4: Update to admin_verified
    request.adminVerified = true;
    request.adminVerifiedBy = adminId;
    request.adminVerifiedAt = new Date();
    request.status = "admin_verified";
    request.selectedDonor = selectedDonorId;

    // Mark selected donor
    request.acceptedDonors.forEach((item) => {
        if (item.donor._id.toString() === selectedDonorId.toString()) {
            item.status = "selected";
        } else {
            item.status = "backup";
            // Add to backup on hold
            request.backupDonorsOnHold.push({
                donor: item.donor._id,
                heldAt: new Date(),
                status: "hold",
            });
        }
    });

    await request.save();

    // Notify selected donor
    const donor = await User.findById(selectedDonorId);
    const receiver = await User.findById(request.requestedBy);

    await Notification.create({
        recipientId: selectedDonorId,
        type: "admin_selected_for_test",
        relatedRequest: request._id,
        message: `You have been selected for blood testing by admin for ${receiver.fullName}'s request. Please come to hospital for scheduling.`,
        priority: "high",
    });

    // Notify backup donors they are on hold
    const backupDonorIds = request.acceptedDonors
        .filter((item) => item.status === "backup")
        .map((item) => item.donor._id);

    for (const backupId of backupDonorIds) {
        await Notification.create({
            recipientId: backupId,
            type: "donor_on_backup",
            relatedRequest: request._id,
            message: "You are on backup. We will contact you if the primary donor cannot proceed.",
        });
    }

    // Notify receiver
    await Notification.create({
        recipientId: request.requestedBy,
        type: "admin_selected_donor",
        relatedRequest: request._id,
        message: `Admin has selected ${donor.fullName} for blood testing. Next: Hospital will schedule the test.`,
        priority: "high",
    });

    return res.status(200).json({
        success: true,
        message: "Donor selected for verification",
        data: {
            requestId: request._id,
            status: request.status,
            selectedDonor: donor.fullName,
            backupDonorsCount: backupDonorIds.length,
        },
    });
});

// Get all requests with acceptances waiting for admin verification (Step 4)
exports.getPendingAdminVerifications = asyncHandler(async (req, res) => {
    const requests = await BloodRequest.find({
        status: "donor_accepted",
    })
        .populate("requestedBy", "fullName bloodGroup")
        .populate("acceptedDonors.donor", "fullName")
        .sort({ createdAt: -1 });

    return res.status(200).json({
        success: true,
        totalPending: requests.length,
        requests: requests.map((req) => ({
            requestId: req._id,
            receiver: req.requestedBy,
            bloodGroup: req.bloodGroup,
            totalAcceptances: req.acceptedDonors.length,
            acceptedDonors: req.acceptedDonors.map((item) => item.donor.fullName),
        })),
    });
});