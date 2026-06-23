const mongoose = require("mongoose");
const BloodRequest = require("../model/bloodRequestModel");
const DonationRecord = require("../model/donationRecordModel");
const Notification = require("../model/notificationModel");
const User = require("../model/userModel");
const asyncHandler = require("express-async-handler");

exports.selectAndVerifyDonors = asyncHandler(async (req, res) => {
    const { requestId } = req.params;
    const { selectedDonorId, rejectedDonorIds, hospitalVerificationNotes } = req.body;
    const hospitalId = req.user.id;

    // Validation
    if (!mongoose.Types.ObjectId.isValid(requestId)) {
        return res.status(400).json({
            success: false,
            message: "Invalid request ID format",
        });
    }

    if (!mongoose.Types.ObjectId.isValid(selectedDonorId)) {
        return res.status(400).json({
            success: false,
            message: "Invalid donor ID format",
        });
    }

    // Validate rejectedDonorIds if provided
    if (rejectedDonorIds && Array.isArray(rejectedDonorIds)) {
        for (const id of rejectedDonorIds) {
            if (!mongoose.Types.ObjectId.isValid(id)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid rejected donor ID format",
                });
            }
        }
    }

    // Get request
    const request = await BloodRequest.findById(requestId);
    if (!request) {
        return res.status(404).json({
            success: false,
            message: "Blood request not found",
        });
    }

    // Check request status
    if (request.status !== "pending" && request.status !== "accepted") {
        return res.status(400).json({
            success: false,
            message: `Cannot process request with status: ${request.status}`,
        });
    }

    // Verify selected donor accepted this request
    const selectedDonorObj = request.acceptedDonors.find(
        (d) => d?.donor?.toString() === selectedDonorId
    );

    if (!selectedDonorObj) {
        return res.status(404).json({
            success: false,
            message: "Selected donor did not accept this request",
        });
    }

    // Update selected donor status
    selectedDonorObj.status = "selected";
    selectedDonorObj.selectedAt = new Date();

    // Process rejected donors
    const rejectedDonors = [];
    if (rejectedDonorIds && rejectedDonorIds.length > 0) {
        for (const rejectedId of rejectedDonorIds) {
            const rejectedDonorObj = request.acceptedDonors.find(
                (d) => d?.donor?.toString() === rejectedId
            );
            if (rejectedDonorObj) {
                rejectedDonorObj.status = "rejected";
                rejectedDonorObj.rejectedAt = new Date();
                rejectedDonorObj.rejectionReason =
                    hospitalVerificationNotes || "Not selected by hospital";
                rejectedDonors.push(rejectedId);
            }
        }
    }

    // Mark any remaining unselected donors as rejected
    for (const donor of request.acceptedDonors) {
        if (
            donor.status === "pending" &&
            donor.donor.toString() !== selectedDonorId
        ) {
            donor.status = "rejected";
            donor.rejectedAt = new Date();
            donor.rejectionReason = "Not selected by hospital";
            if (!rejectedDonors.includes(donor.donor.toString())) {
                rejectedDonors.push(donor.donor.toString());
            }
        }
    }

    // Update request
    request.selectedDonor = selectedDonorId;
    request.assignedHospital = hospitalId;
    request.status = "matched";
    request.matchedAt = new Date();
    request.hospitalVerifiedAt = new Date();
    await request.save();

    // Create donation record
    const donation = await DonationRecord.create({
        donorId: selectedDonorId,
        receiverId: request.requestedBy,
        requestId: request._id,
        hospitalId: hospitalId,
        status: "matched",
        verificationStatus: "pending",
        hospitalVerificationNotes:
            hospitalVerificationNotes || "Hospital verified. Awaiting donation.",
    });

    // Get user details
    const selectedDonor = await User.findById(selectedDonorId).select(
        "fullName phoneNumber email"
    );
    const receiver = await User.findById(request.requestedBy).select(
        "fullName phoneNumber"
    );
    const hospital = await User.findById(hospitalId).select(
        "fullName hospitalName"
    );

    // Notify selected donor
    await Notification.create({
        recipientId: selectedDonorId,
        message: `Congratulations! ${hospital.fullName} (${hospital.hospitalName}) has selected you to donate blood for ${receiver.fullName}. Please proceed with the donation process.`,
        type: "donor_selected",
        relatedRequest: requestId,
        relatedDonation: donation._id,
    });

    // Notify receiver
    await Notification.create({
        recipientId: request.requestedBy,
        message: `${hospital.fullName} has selected ${selectedDonor.fullName} for your blood request. The donation process will begin shortly.`,
        type: "donor_selected",
        relatedRequest: requestId,
        relatedDonation: donation._id,
    });

    // Notify rejected donors
    for (const rejectedDonorId of rejectedDonors) {
        const rejectedDonor = await User.findById(rejectedDonorId).select(
            "fullName"
        );
        await Notification.create({
            recipientId: rejectedDonorId,
            message: `The hospital selected another donor for this request. Thank you for your willingness to help!`,
            type: "donor_rejected",
            relatedRequest: requestId,
        });
    }

    return res.status(200).json({
        success: true,
        message: "Donor selected successfully. Donation process initiated.",
        data: {
            donationId: donation._id,
            donorId: selectedDonorId,
            donorName: selectedDonor.fullName,
            requestId: requestId,
            status: "matched",
            nextStep: "Donor will initiate donation process",
        },
    });
});

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