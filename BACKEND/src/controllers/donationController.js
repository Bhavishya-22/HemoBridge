// donationController.js
const mongoose = require("mongoose");
const DonationRecord = require("../model/donationRecordModel");
const BloodRequest = require("../model/bloodRequestModel");
const Notification = require("../model/notificationModel");
const User = require("../model/userModel");
const asyncHandler = require("express-async-handler");
const { REQUEST_STATUSES } = require("../utils/stateMachine");
const { promoteNearestBackupDonor } = require("../utils/donorSelectionService");
const { logAuditEvent } = require("../utils/auditLogger");

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

    // Support lookup by donation ID or fallback to requestId
    let donation = await DonationRecord.findById(donationId);
    if (!donation) {
        donation = await DonationRecord.findOne({
            requestId: donationId,
            status: { $in: ["pending", "initiated"] },
        });
    }

    if (!donation) {
        return res.status(404).json({
            success: false,
            message: "Donation record not found",
        });
    }

    // Verify hospital authorization
    if (donation.hospitalId.toString() !== hospitalId.toString()) {
        return res.status(403).json({
            success: false,
            message: "Only assigned hospital can verify donation",
        });
    }

    const request = await BloodRequest.findById(donation.requestId)
        .populate("confirmedDonor", "fullName phoneNumber")
        .populate("acceptedDonors.donor", "fullName phoneNumber")
        .populate("rejectedDonors.donor", "fullName")
        .populate("requestedBy", "fullName phoneNumber");

    if (isVerified) {
        // Blood test passed
        donation.status = "completed";
        donation.verificationStatus = "verified";
        donation.verifiedAt = new Date();
        donation.verifiedBy = hospitalId;
        donation.completedAt = new Date();
        donation.hospitalVerificationNotes =
            verificationNotes || "Blood donation verified successfully";

        await donation.save();

        // Update blood request to final_completed
        if (request) {
            request.status = REQUEST_STATUSES.FINAL_COMPLETED;
            request.bloodTestResult = "accepted";
            request.completedAt = new Date();
            request.finalThankYouSent = true;
            request.finalThankYouSentAt = new Date();
            await request.save();
        }

        // Make donor available again
        await User.findByIdAndUpdate(donation.donorId, {
            availabilityStatus: "available",
        });

        // 1. Thank you to confirmed donor
        await Notification.create({
            recipientId: donation.donorId,
            type: "blood_donation_thank_you",
            relatedRequest: donation.requestId,
            relatedDonation: donation._id,
            message: `🎉 Thank you, ${request?.confirmedDonor?.fullName || "Donor"}! Your blood donation has been verified by the hospital. You saved a life! - ${request?.requestedBy?.fullName || "Receiver"}`,
            priority: "high",
        });

        // 2. Notify receiver
        await Notification.create({
            recipientId: donation.receiverId,
            type: "request_completed",
            relatedRequest: donation.requestId,
            relatedDonation: donation._id,
            message: `A suitable blood donor (${request?.confirmedDonor?.fullName || "Donor"}) has been verified by the hospital and your blood request is now completed!`,
            priority: "high",
        });

        // 3. Thank you to standby / backup donors
        const rejectedDonorIds = new Set(
            (request?.rejectedDonors || []).map((r) => (r.donor?._id || r.donor).toString())
        );
        const otherAccepted = (request?.acceptedDonors || []).filter((item) => {
            const dId = (item.donor?._id || item.donor).toString();
            return dId !== donation.donorId.toString() && !rejectedDonorIds.has(dId);
        });

        for (const donorItem of otherAccepted) {
            const otherDonorId = donorItem.donor?._id || donorItem.donor;
            await Notification.create({
                recipientId: otherDonorId,
                type: "donor_not_selected_thanks",
                relatedRequest: donation.requestId,
                message: "Thank you for accepting to help! Blood donation has been completed with the primary donor. We appreciate your readiness to save a life!",
            });
        }

        // 4. Thank you to rejected donors
        if (request?.rejectedDonors && request.rejectedDonors.length > 0) {
            for (const rejectedDonor of request.rejectedDonors) {
                const rId = (rejectedDonor.donor?._id || rejectedDonor.donor).toString();
                if (rId !== donation.donorId.toString()) {
                    await Notification.create({
                        recipientId: rId,
                        type: "donor_rejection_thanks",
                        relatedRequest: donation.requestId,
                        message: "Thank you for considering to help! Donation is now complete. We hope to see you in future drives.",
                    });
                }
            }
        }

        await logAuditEvent({
            requestId: donation.requestId,
            actor: hospitalId,
            actorRole: "hospital",
            action: "DONATION_VERIFIED",
            previousStatus: REQUEST_STATUSES.BLOOD_TEST_SCHEDULED,
            newStatus: REQUEST_STATUSES.FINAL_COMPLETED,
            metadata: {
                donationId: donation._id,
                donorId: donation.donorId,
                verificationNotes: donation.hospitalVerificationNotes,
            },
            note: "Hospital verified blood donation successfully",
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
            verificationNotes || "Blood donation rejected by hospital during verification";

        await donation.save();

        // Make donor available again
        await User.findByIdAndUpdate(donation.donorId, {
            availabilityStatus: "available",
        });

        // Notify failed donor
        await Notification.create({
            recipientId: donation.donorId,
            type: "blood_test_rejected",
            relatedDonation: donation._id,
            relatedRequest: donation.requestId,
            message:
                verificationNotes ||
                "Your blood donation was not accepted after testing by the hospital.",
        });

        // Delegate backup promotion to centralized service
        const promotionResult = await promoteNearestBackupDonor(
            donation.requestId,
            donation.donorId,
            verificationNotes || "Blood donation rejected by hospital during verification"
        );

        // If backup was successfully promoted, create a new pending DonationRecord for them
        let nextDonation = null;
        if (promotionResult.promoted && promotionResult.nextDonor) {
            const nextDonorId = promotionResult.nextDonor.id || promotionResult.nextDonor._id || promotionResult.nextDonor;
            nextDonation = await DonationRecord.create({
                donorId: nextDonorId,
                receiverId: donation.receiverId,
                requestId: donation.requestId,
                hospitalId: hospitalId,
                status: "pending",
                verificationStatus: "pending",
                initiatedAt: new Date(),
            });
        }

        await logAuditEvent({
            requestId: donation.requestId,
            actor: hospitalId,
            actorRole: "hospital",
            action: "DONATION_REJECTED",
            previousStatus: REQUEST_STATUSES.BLOOD_TEST_SCHEDULED,
            newStatus: promotionResult.status || REQUEST_STATUSES.BLOOD_TEST_SCHEDULED,
            metadata: {
                donationId: donation._id,
                failedDonorId: donation.donorId,
                verificationNotes: donation.hospitalVerificationNotes,
                promoted: promotionResult.promoted,
                nextDonor: promotionResult.nextDonor ? (promotionResult.nextDonor.fullName || promotionResult.nextDonor) : null,
                nextDonationId: nextDonation?._id || null,
            },
            note: "Hospital rejected blood donation; backup promotion triggered",
        });

        return res.status(200).json({
            success: true,
            message: "Blood donation rejected. " + promotionResult.message,
            data: {
                donationId: donation._id,
                status: donation.status,
                verificationStatus: donation.verificationStatus,
                nextDonor: promotionResult.nextDonor ? (promotionResult.nextDonor.fullName || promotionResult.nextDonor) : null,
                promoted: promotionResult.promoted,
                nextDonationId: nextDonation?._id || null,
            },
        });
    }
});