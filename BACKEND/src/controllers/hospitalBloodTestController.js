const mongoose = require("mongoose");
const BloodRequest = require("../model/bloodRequestModel");
const DonationRecord = require("../model/donationRecordModel");
const Notification = require("../model/notificationModel");
const User = require("../model/userModel");
const asyncHandler = require("express-async-handler");

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
        .populate("selectedDonor", "fullName phoneNumber");

    if (!request) {
        return res.status(404).json({
            success: false,
            message: "Blood request not found",
        });
    }

    if (request.status !== "admin_verified") {
        return res.status(400).json({
            success: false,
            message: "Request must be admin verified before scheduling test",
        });
    }

    if (!request.selectedDonor) {
        return res.status(400).json({
            success: false,
            message: "No donor selected",
        });
    }

    // STEP 5: Update to blood_test_scheduled
    request.bloodTestScheduled = true;
    request.bloodTestScheduledBy = hospitalId;
    request.bloodTestScheduledAt = new Date();
    request.status = "blood_test_scheduled";

    await request.save();

    const donor = await User.findById(request.selectedDonor);
    const receiver = await User.findById(request.requestedBy);

    // Notify donor about scheduled test
    await Notification.create({
        recipientId: request.selectedDonor,
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
        message: `Blood test scheduled for selected donor: ${donor.fullName}. After the test, please confirm if it was successful or failed.`,
    });

    return res.status(200).json({
        success: true,
        message: "Blood test scheduled. Receiver will confirm result after test.",
        data: {
            requestId: request._id,
            status: request.status,
            selectedDonor: donor.fullName,
            testScheduledDate: testScheduleDate,
        },
    });
});

// NEW: STEP 6 - Receiver confirms blood test SUCCESS and sends final thank you
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
        .populate("selectedDonor", "fullName")
        .populate("backupDonorsOnHold.donor", "fullName")
        .populate("acceptedDonors.donor", "fullName")
        .populate("rejectedDonors.donor", "fullName");

    if (!request) {
        return res.status(404).json({
            success: false,
            message: "Blood request not found",
        });
    }

    if (request.status !== "blood_test_scheduled") {
        return res.status(400).json({
            success: false,
            message: "Blood test must be scheduled before confirmation",
        });
    }

    // Verify receiver is the request creator
    if (request.requestedBy.toString() !== receiverId.toString()) {
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

    // DIRECTLY SET TO final_completed (no separate thank you step needed)
    request.status = "final_completed";
    request.completedAt = new Date();
    request.finalThankYouSent = true;
    request.finalThankYouSentAt = new Date();

    await request.save();

    const selectedDonor = await User.findById(request.selectedDonor);

    // Create donation record
    const donation = await DonationRecord.create({
        donorId: request.selectedDonor,
        receiverId: request.requestedBy,
        requestId: request._id,
        hospitalId: request.assignedHospital,
        status: "completed",
        verificationStatus: "verified",
        verifiedAt: new Date(),
        verifiedBy: request.assignedHospital,
        hospitalVerificationNotes: "Receiver confirmed successful donation",
    });

    // Make donor available again
    await User.findByIdAndUpdate(request.selectedDonor, {
        availabilityStatus: "available",
    });

    const thankYouMessage = message || "Thank you for saving my life!";

    // 🎉 THANK YOU to selected donor
    await Notification.create({
        recipientId: request.selectedDonor._id,
        type: "blood_donation_thank_you",
        relatedRequest: request._id,
        relatedDonation: donation._id,
        message: `🎉 Thank you, ${selectedDonor.fullName}! Your blood donation was successful. You saved a life! - ${request.requestedBy.fullName || "Receiver"}`,
        priority: "high",
    });

    // 🙏 THANK YOU to backup donors
    if (request.backupDonorsOnHold && request.backupDonorsOnHold.length > 0) {
        for (const backupDonor of request.backupDonorsOnHold) {
            await Notification.create({
                recipientId: backupDonor.donor._id,
                type: "backup_donor_thanks",
                relatedRequest: request._id,
                message: `Donation completed successfully! Thank you for being ready to help. ${thankYouMessage} - Next time we hope we may get your blood.`,
            });
        }
    }

    // 🙏 THANK YOU to accepted but not selected donors
    const notSelectedAccepted = request.acceptedDonors.filter(
        (item) => item.donor._id.toString() !== request.selectedDonor.toString()
    );

    for (const donorItem of notSelectedAccepted) {
        await Notification.create({
            recipientId: donorItem.donor._id,
            type: "donor_not_selected_thanks",
            relatedRequest: request._id,
            message: `Thank you for accepting to help! Though another donor was selected, donation is now complete. ${thankYouMessage} - Next time we hope we may get your blood.`,
        });
    }

    // 🙏 THANK YOU to rejected donors
    if (request.rejectedDonors && request.rejectedDonors.length > 0) {
        for (const rejectedDonor of request.rejectedDonors) {
            await Notification.create({
                recipientId: rejectedDonor.donor,
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
            selectedDonor: selectedDonor.fullName,
            notificationsSent: {
                selectedDonor: 1,
                backupDonors: request.backupDonorsOnHold?.length || 0,
                acceptedDonors: notSelectedAccepted.length,
                rejectedDonors: request.rejectedDonors?.length || 0,
            },
            message: "Donation process complete! All donors notified.",
        },
    });
});

// NEW: STEP 6 - Receiver confirms blood test FAILURE
// Loops back to next donor or Step 2 if no donors left
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
        .populate("selectedDonor", "fullName")
        .populate("backupDonorsOnHold.donor", "fullName");

    if (!request) {
        return res.status(404).json({
            success: false,
            message: "Blood request not found",
        });
    }

    if (request.status !== "blood_test_scheduled") {
        return res.status(400).json({
            success: false,
            message: "Blood test must be scheduled before confirmation",
        });
    }

    // Verify receiver is the request creator
    if (request.requestedBy.toString() !== receiverId.toString()) {
        return res.status(403).json({
            success: false,
            message: "Only request creator can confirm result",
        });
    }

    const selectedDonor = await User.findById(request.selectedDonor);
    const receiver = await User.findById(request.requestedBy);

    // Record receiver's confirmation - FAILED
    request.receiverBloodTestConfirmation = {
        confirmedBy: receiverId,
        status: "failed",
        message: message || "Blood donation failed during test",
        confirmedAt: new Date(),
    };

    // Add to rejected list
    request.rejectedDonors.push({
        donor: request.selectedDonor,
        reason: message || "Receiver reported failure during blood test",
        rejectedAt: new Date(),
    });

    // Notify failed donor
    await Notification.create({
        recipientId: request.selectedDonor._id,
        type: "blood_test_failed",
        relatedRequest: request._id,
        message: `Your blood test was not successful. Reason: ${message || "Blood quality issues"}. Thank you for trying!`,
    });

    // Check if backup donors available
    if (request.backupDonorsOnHold && request.backupDonorsOnHold.length > 0) {
        // LOOP back to STEP 5 with next donor
        const nextBackup = request.backupDonorsOnHold[0];
        
        request.selectedDonor = nextBackup.donor;
        request.status = "blood_test_scheduled"; // Back to step 5
        request.backupDonorsOnHold.shift(); // Remove from backup
        request.receiverBloodTestConfirmation = null; // Reset confirmation
        
        await request.save();

        const nextDonor = await User.findById(nextBackup.donor);

        // Notify new selected donor
        await Notification.create({
            recipientId: nextBackup.donor,
            type: "blood_test_scheduled",
            relatedRequest: request._id,
            message: `Previous donor's blood test was unsuccessful. You have been selected for blood testing for ${receiver.fullName}. Please come to hospital.`,
            priority: "high",
        });

        // Notify receiver
        await Notification.create({
            recipientId: request.requestedBy,
            type: "blood_test_failed_next_donor",
            relatedRequest: request._id,
            message: `Blood test unsuccessful with ${selectedDonor.fullName}. Testing next donor: ${nextDonor.fullName}`,
        });

        return res.status(200).json({
            success: true,
            message: "Blood test failed. Testing next backup donor",
            data: {
                requestId: request._id,
                status: request.status,
                failedDonor: selectedDonor.fullName,
                nextDonor: nextDonor.fullName,
                backupDonorsRemaining: request.backupDonorsOnHold.length,
            },
        });

    } else {
        // No backup donors left - LOOP back to STEP 2 (hospital_approved)
        request.status = "hospital_approved";
        request.receiverBloodTestConfirmation = null; // Reset confirmation
        await request.save();

        // Notify receiver
        await Notification.create({
            recipientId: request.requestedBy,
            type: "all_donors_exhausted",
            relatedRequest: request._id,
            message: `All tested donors failed blood test. Hospital will find more donors.`,
        });

        return res.status(200).json({
            success: true,
            message: "Blood test failed. No more backup donors. Looping back to find new donors.",
            data: {
                requestId: request._id,
                status: request.status,
                message: "Hospital will search for new donors",
            },
        });
    }
});

// Get pending blood test verifications (for hospital to see which are waiting for receiver confirmation)
exports.getPendingBloodTestVerifications = asyncHandler(async (req, res) => {
    const hospitalId = req.user.id;

    const requests = await BloodRequest.find({
        status: "blood_test_scheduled",
        assignedHospital: hospitalId,
    })
        .populate("requestedBy", "fullName bloodGroup")
        .populate("selectedDonor", "fullName phoneNumber")
        .sort({ createdAt: -1 });

    return res.status(200).json({
        success: true,
        totalPending: requests.length,
        requests: requests.map((req) => ({
            requestId: req._id,
            receiver: req.requestedBy,
            selectedDonor: req.selectedDonor,
            bloodGroup: req.bloodGroup,
            testScheduledAt: req.bloodTestScheduledAt,
            message: "Awaiting receiver confirmation of test result",
        })),
    });
});