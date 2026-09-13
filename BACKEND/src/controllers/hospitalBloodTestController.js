const mongoose = require("mongoose");
const BloodRequest = require("../model/bloodRequestModel");
const DonationRecord = require("../model/donationRecordModel");
const Notification = require("../model/notificationModel");
const User = require("../model/userModel");
const asyncHandler = require("express-async-handler");
const { REQUEST_STATUSES } = require("../utils/stateMachine");

// STEP 5: Hospital schedules blood test & creates initial pending DonationRecord
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
        .populate("confirmedDonor", "fullName phoneNumber")
        .populate("assignedHospital", "fullName hospitalName");

    if (!request) {
        return res.status(404).json({
            success: false,
            message: "Blood request not found",
        });
    }

    if (
        request.status !== REQUEST_STATUSES.ADMIN_VERIFIED &&
        request.status !== REQUEST_STATUSES.MATCHED
    ) {
        return res.status(400).json({
            success: false,
            message: "Request must be matched or admin verified before scheduling test",
        });
    }

    if (!request.confirmedDonor) {
        return res.status(400).json({
            success: false,
            message: "No confirmed donor selected",
        });
    }

    const assignedHospitalId = (request.assignedHospital?._id || request.assignedHospital)?.toString();
    if (assignedHospitalId && assignedHospitalId !== hospitalId.toString()) {
        return res.status(403).json({
            success: false,
            message: "Only the assigned hospital can schedule the blood test",
        });
    }

    // Update status to blood_test_scheduled
    request.bloodTestScheduled = true;
    request.bloodTestScheduledBy = hospitalId;
    request.bloodTestScheduledAt = new Date();
    request.status = REQUEST_STATUSES.BLOOD_TEST_SCHEDULED;
    await request.save();

    const donorId = request.confirmedDonor._id || request.confirmedDonor;
    const receiverId = request.requestedBy._id || request.requestedBy;
    const donor = await User.findById(donorId);

    // Create or find initial pending DonationRecord
    let donation = await DonationRecord.findOne({
        requestId: request._id,
        donorId: donorId,
        status: { $in: ["pending", "initiated"] },
    });

    if (!donation) {
        donation = await DonationRecord.create({
            donorId,
            receiverId,
            requestId: request._id,
            hospitalId,
            status: "pending",
            verificationStatus: "pending",
            initiatedAt: new Date(),
        });
    }

    // Notify donor about scheduled test
    await Notification.create({
        recipientId: donorId,
        type: "blood_test_scheduled",
        relatedRequest: request._id,
        relatedDonation: donation._id,
        message: `Your blood test is scheduled for ${testScheduleDate || "soon"}. Please report to the hospital for testing.`,
        priority: "high",
    });

    // Notify receiver
    await Notification.create({
        recipientId: receiverId,
        type: "blood_test_scheduled",
        relatedRequest: request._id,
        relatedDonation: donation._id,
        message: `Blood test scheduled for confirmed donor: ${donor?.fullName || "Donor"}. Hospital will verify the blood test result.`,
        priority: "high",
    });

    return res.status(200).json({
        success: true,
        message: "Blood test scheduled. Hospital will verify blood test result.",
        data: {
            requestId: request._id,
            donationId: donation._id,
            status: request.status,
            confirmedDonor: donor?.fullName,
            testScheduledDate: testScheduleDate,
        },
    });
});

/**
 * @deprecated Blood test verification is now exclusively handled by the assigned hospital via
 * donationController.verifyDonation (POST /donations/:donationId/verify).
 * Receivers can no longer unilaterally self-certify blood tests.
 */
exports.receiverConfirmSuccess = asyncHandler(async (req, res) => {
    return res.status(403).json({
        success: false,
        message: "Blood test verification must be performed by the assigned hospital, not the receiver.",
    });
});

/**
 * @deprecated Blood test verification is now exclusively handled by the assigned hospital via
 * donationController.verifyDonation (POST /donations/:donationId/verify).
 * Receivers can no longer unilaterally fail blood tests.
 */
exports.receiverConfirmFailure = asyncHandler(async (req, res) => {
    return res.status(403).json({
        success: false,
        message: "Blood test verification must be performed by the assigned hospital, not the receiver.",
    });
});

// Get pending blood test requests for the hospital (both matched and scheduled)
exports.getPendingBloodTestVerifications = asyncHandler(async (req, res) => {
    const hospitalId = req.user.id;

    const requests = await BloodRequest.find({
        status: { $in: [REQUEST_STATUSES.MATCHED, REQUEST_STATUSES.BLOOD_TEST_SCHEDULED] },
        assignedHospital: hospitalId,
    })
        .populate("requestedBy", "fullName phoneNumber email bloodGroup")
        .populate("confirmedDonor", "fullName phoneNumber email bloodGroup weight height diseases location")
        .sort({ createdAt: -1 });

    const requestIds = requests.map((r) => r._id);
    const donations = await DonationRecord.find({
        requestId: { $in: requestIds },
        status: { $in: ["pending", "initiated"] },
    });

    const donationMap = {};
    donations.forEach((d) => {
        donationMap[d.requestId.toString()] = d._id;
    });

    return res.status(200).json({
        success: true,
        totalPending: requests.length,
        requests: requests.map((req) => ({
            requestId: req._id,
            receiver: req.requestedBy,
            confirmedDonor: req.confirmedDonor,
            bloodGroup: req.bloodGroup,
            quantity: req.quantity,
            emergencyLevel: req.emergencyLevel,
            status: req.status,
            testScheduledAt: req.bloodTestScheduledAt,
            donationId: donationMap[req._id.toString()] || null,
        })),
    });
});