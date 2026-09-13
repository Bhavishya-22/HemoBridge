const mongoose = require("mongoose");
const BloodRequest = require("../model/bloodRequestModel");
const DonationRecord = require("../model/donationRecordModel");
const Notification = require("../model/notificationModel");
const User = require("../model/userModel");
const asyncHandler = require("express-async-handler");
const { REQUEST_STATUSES } = require("../utils/stateMachine");
const { promoteNearestBackupDonor } = require("../utils/donorSelectionService");

// STEP 5: Hospital schedules blood test
exports.scheduleBloodTest = asyncHandler(async (req, res) => {
    const { requestId } = req.params;
    const { testScheduleDate } = req.body;
    const hospitalId = req.user.id;

    if (!mongoose.Types.ObjectId.isValid(requestId)) {
        return res.status(400).json({
            success: false,
            message: "Invalid request ID",
        });
    }

    const request = await BloodRequest.findById(requestId)
        .populate("confirmedDonor", "fullName phoneNumber");

    if (!request) {
        return res.status(404).json({
            success: false,
            message: "Blood request not found",
        });
    }

    if (request.status !== REQUEST_STATUSES.ADMIN_VERIFIED) {
        return res.status(400).json({
            success: false,
            message: "Request must be admin verified before scheduling test",
        });
    }

    if (!request.confirmedDonor) {
        return res.status(400).json({
            success: false,
            message: "No confirmed donor selected",
        });
    }

    // STEP 5: Update to blood_test_scheduled
    request.bloodTestScheduled = true;
    request.bloodTestScheduledBy = hospitalId;
    request.bloodTestScheduledAt = new Date();
    request.status = REQUEST_STATUSES.BLOOD_TEST_SCHEDULED;

    await request.save();

    const donorId = request.confirmedDonor._id || request.confirmedDonor;
    const donor = await User.findById(donorId);
    const receiver = await User.findById(request.requestedBy);

    // Notify donor about scheduled test
    await Notification.create({
        recipientId: donorId,
        type: "blood_test_scheduled",
        relatedRequest: request._id,
        message: `Your blood test is scheduled for ${testScheduleDate || "soon"}. Please come to hospital.`,
        priority: "high",
    });

    // Notify receiver to confirm result after test
    await Notification.create({
        recipientId: request.requestedBy,
        type: "blood_test_scheduled",
        relatedRequest: request._id,
        message: `Blood test scheduled for confirmed donor: ${donor?.fullName || "Donor"}. After the test, please confirm if it was successful or failed.`,
    });

    return res.status(200).json({
        success: true,
        message: "Blood test scheduled. Receiver will confirm result after test.",
        data: {
            requestId: request._id,
            status: request.status,
            confirmedDonor: donor?.fullName,
            testScheduledDate: testScheduleDate,
        },
    });
});

// STEP 6 - Receiver confirms blood test SUCCESS and sends final thank you
// Status goes directly to final_completed
exports.receiverConfirmSuccess = asyncHandler(async (req, res) => {
    const { requestId } = req.params;
    const { message } = req.body;
    const receiverId = req.user.id;

    if (!mongoose.Types.ObjectId.isValid(requestId)) {
        return res.status(400).json({
            success: false,
            message: "Invalid request ID",
        });
    }

    const request = await BloodRequest.findById(requestId)
        .populate("confirmedDonor", "fullName")
        .populate("acceptedDonors.donor", "fullName")
        .populate("rejectedDonors.donor", "fullName")
        .populate("requestedBy", "fullName");

    if (!request) {
        return res.status(404).json({
            success: false,
            message: "Blood request not found",
        });
    }

    if (request.status !== REQUEST_STATUSES.BLOOD_TEST_SCHEDULED) {
        return res.status(400).json({
            success: false,
            message: "Blood test must be scheduled before confirmation",
        });
    }

    const requestedById = request.requestedBy?._id || request.requestedBy;
    // Verify receiver is the request creator
    if (requestedById.toString() !== receiverId.toString()) {
        return res.status(403).json({
            success: false,
            message: "Only request creator can confirm result",
        });
    }

    // Record receiver's confirmation - SUCCESS
    request.receiverBloodTestConfirmation = {
        confirmedBy: receiverId,
        status: "success",
        message: message || "Blood donation successful",
        confirmedAt: new Date(),
    };

    // DIRECTLY SET TO final_completed
    request.status = REQUEST_STATUSES.FINAL_COMPLETED;
    request.completedAt = new Date();
    request.finalThankYouSent = true;
    request.finalThankYouSentAt = new Date();

    await request.save();

    const confirmedDonorId = request.confirmedDonor?._id || request.confirmedDonor;
    const confirmedDonor = await User.findById(confirmedDonorId);

    // Create donation record
    const donation = await DonationRecord.create({
        donorId: confirmedDonorId,
        receiverId: requestedById,
        requestId: request._id,
        hospitalId: request.assignedHospital,
        status: "completed",
        verificationStatus: "verified",
        verifiedAt: new Date(),
        verifiedBy: request.assignedHospital,
        hospitalVerificationNotes: "Receiver confirmed successful donation",
    });

    // Make donor available again
    await User.findByIdAndUpdate(confirmedDonorId, {
        availabilityStatus: "available",
    });

    const thankYouMessage = message || "Thank you for saving my life!";

    // 🎉 THANK YOU to confirmed donor
    await Notification.create({
        recipientId: confirmedDonorId,
        type: "blood_donation_thank_you",
        relatedRequest: request._id,
        relatedDonation: donation._id,
        message: `🎉 Thank you, ${confirmedDonor?.fullName || "Donor"}! Your blood donation was successful. You saved a life! - ${request.requestedBy?.fullName || "Receiver"}`,
        priority: "high",
    });

    // 🙏 THANK YOU to accepted but not selected donors
    const rejectedDonorIds = new Set((request.rejectedDonors || []).map((r) => (r.donor?._id || r.donor).toString()));
    const otherAccepted = (request.acceptedDonors || []).filter((item) => {
        const dId = (item.donor?._id || item.donor).toString();
        return dId !== confirmedDonorId.toString() && !rejectedDonorIds.has(dId);
    });

    for (const donorItem of otherAccepted) {
        const otherDonorId = donorItem.donor?._id || donorItem.donor;
        await Notification.create({
            recipientId: otherDonorId,
            type: "donor_not_selected_thanks",
            relatedRequest: request._id,
            message: `Thank you for accepting to help! Though another donor was selected, donation is now complete. ${thankYouMessage} - Next time we hope we may get your blood.`,
        });
    }

    // 🙏 THANK YOU to rejected donors
    if (request.rejectedDonors && request.rejectedDonors.length > 0) {
        for (const rejectedDonor of request.rejectedDonors) {
            const rId = rejectedDonor.donor?._id || rejectedDonor.donor;
            await Notification.create({
                recipientId: rId,
                type: "donor_rejection_thanks",
                relatedRequest: request._id,
                message: `Thank you for considering to help! Donation is now complete. ${thankYouMessage} - We hope to see you in future drives.`,
            });
        }
    }

    return res.status(200).json({
        success: true,
        message: "Donation confirmed as successful! Final thank you sent to all donors.",
        data: {
            requestId: request._id,
            status: request.status,
            donationId: donation._id,
            confirmedDonor: confirmedDonor?.fullName,
            notificationsSent: {
                confirmedDonor: 1,
                acceptedDonors: otherAccepted.length,
                rejectedDonors: request.rejectedDonors?.length || 0,
            },
            message: "Donation process complete! All donors notified.",
        },
    });
});

// STEP 6 - Receiver confirms blood test FAILURE
// Loops back to next accepted donor or hospital_approved if no donors left
exports.receiverConfirmFailure = asyncHandler(async (req, res) => {
    const { requestId } = req.params;
    const { message } = req.body;
    const receiverId = req.user.id;

    if (!mongoose.Types.ObjectId.isValid(requestId)) {
        return res.status(400).json({
            success: false,
            message: "Invalid request ID",
        });
    }

    const request = await BloodRequest.findById(requestId)
        .populate("confirmedDonor", "fullName")
        .populate("acceptedDonors.donor", "fullName")
        .populate("requestedBy", "fullName");

    if (!request) {
        return res.status(404).json({
            success: false,
            message: "Blood request not found",
        });
    }

    if (request.status !== REQUEST_STATUSES.BLOOD_TEST_SCHEDULED) {
        return res.status(400).json({
            success: false,
            message: "Blood test must be scheduled before confirmation",
        });
    }

    const requestedById = request.requestedBy?._id || request.requestedBy;
    // Verify receiver is the request creator
    if (requestedById.toString() !== receiverId.toString()) {
        return res.status(403).json({
            success: false,
            message: "Only request creator can confirm result",
        });
    }

    const failedDonorId = request.confirmedDonor?._id || request.confirmedDonor;
    const failedDonor = failedDonorId ? await User.findById(failedDonorId) : null;

    // Record receiver's confirmation - FAILED
    request.receiverBloodTestConfirmation = {
        confirmedBy: receiverId,
        status: "failed",
        message: message || "Blood donation failed during test",
        confirmedAt: new Date(),
    };
    await request.save();

    // Delegate to centralized backup promotion service (ranks remaining backups by distance)
    const promotionResult = await promoteNearestBackupDonor(requestId, failedDonorId, message);

    return res.status(200).json({
        success: true,
        message: promotionResult.message,
        data: {
            requestId: request._id,
            status: promotionResult.status,
            failedDonor: failedDonor?.fullName,
            nextDonor: promotionResult.nextDonor ? promotionResult.nextDonor.fullName : null,
            promoted: promotionResult.promoted,
        },
    });
});

// Get pending blood test verifications (for hospital to see which are waiting for receiver confirmation)
exports.getPendingBloodTestVerifications = asyncHandler(async (req, res) => {
    const hospitalId = req.user.id;

    const requests = await BloodRequest.find({
        status: REQUEST_STATUSES.BLOOD_TEST_SCHEDULED,
        assignedHospital: hospitalId,
    })
        .populate("requestedBy", "fullName bloodGroup")
        .populate("confirmedDonor", "fullName phoneNumber")
        .sort({ createdAt: -1 });

    return res.status(200).json({
        success: true,
        totalPending: requests.length,
        requests: requests.map((req) => ({
            requestId: req._id,
            receiver: req.requestedBy,
            confirmedDonor: req.confirmedDonor,
            bloodGroup: req.bloodGroup,
            testScheduledAt: req.bloodTestScheduledAt,
            message: "Awaiting receiver confirmation of test result",
        })),
    });
});