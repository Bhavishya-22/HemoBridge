// acceptController.js
const mongoose = require("mongoose");
const asyncHandler = require("express-async-handler");
const BloodRequest = require("../model/bloodRequestModel");
const Notification = require("../model/notificationModel");
const User = require("../model/userModel");
const { REQUEST_STATUSES, validateTransition } = require("../utils/stateMachine");
const {
  escalateToNextDonor,
  notifyHeldDonorsFulfilled,
} = require("../utils/donorSelectionService");
const { logAuditEvent } = require("../utils/auditLogger");

/**
 * STEP 5: Donor accepts the blood request.
 * Fix Flaw 1: Solves race conditions via atomic findOneAndUpdate with state & donor precondition filters.
 * Marks request as "matched", notifies receiver, hospital, and fulfills/clears other held donors.
 */
exports.acceptRequest = asyncHandler(async (req, res) => {
  const { requestId } = req.params;
  const donorId = req.user.id;

  if (!mongoose.Types.ObjectId.isValid(requestId)) {
    return res.status(400).json({
      success: false,
      message: "Invalid request ID format",
    });
  }

  const now = new Date();

  // Fix Flaw 1: Atomic findOneAndUpdate with status and active donor lock
  // Only the designated active donor can transition a request currently in "waiting_for_donor"
  // before the response deadline expires. Any competing concurrent writes will fail atomically.
  const updatedRequest = await BloodRequest.findOneAndUpdate(
    {
      _id: requestId,
      status: REQUEST_STATUSES.WAITING_FOR_DONOR,
      selectedDonor: donorId,
      $or: [
        { donorResponseDeadline: { $exists: false } },
        { donorResponseDeadline: null },
        { donorResponseDeadline: { $gte: now } },
      ],
    },
    {
      $set: {
        status: REQUEST_STATUSES.MATCHED,
        matchedAt: now,
        donorResponseDeadline: null,
        "donorQueue.$[elem].status": "accepted",
      },
      $push: {
        acceptedDonors: {
          donor: donorId,
          acceptedAt: now,
          status: "accepted",
        },
      },
    },
    {
      arrayFilters: [{ "elem.donor": donorId }],
      returnDocument: "after",
    }
  );

  // If the atomic update returned null, find out precisely why for a clean, deterministic error
  if (!updatedRequest) {
    const existingRequest = await BloodRequest.findById(requestId);

    if (!existingRequest) {
      return res.status(404).json({
        success: false,
        message: "Blood request not found",
      });
    }

    if (
      existingRequest.status === REQUEST_STATUSES.MATCHED ||
      existingRequest.status === REQUEST_STATUSES.DONOR_ACCEPTED ||
      existingRequest.status === REQUEST_STATUSES.FINAL_COMPLETED
    ) {
      return res.status(409).json({
        success: false,
        message: "This blood request has already been matched or completed with another donor.",
      });
    }

    if (existingRequest.status !== REQUEST_STATUSES.WAITING_FOR_DONOR) {
      return res.status(400).json({
        success: false,
        message: `This request is not open for acceptance. Current status: '${existingRequest.status}'`,
      });
    }

    if (
      existingRequest.selectedDonor &&
      existingRequest.selectedDonor.toString() !== donorId.toString()
    ) {
      return res.status(403).json({
        success: false,
        message: "You are not the currently selected donor for this request.",
      });
    }

    if (
      existingRequest.donorResponseDeadline &&
      existingRequest.donorResponseDeadline < now
    ) {
      // Trigger escalation immediately since deadline passed
      await escalateToNextDonor(requestId, {
        reason: "timeout",
        actorId: donorId,
        actorRole: "donor",
        note: "Donor attempted acceptance after response deadline expired",
      });

      return res.status(410).json({
        success: false,
        message: "The response window for this blood request has expired. It has escalated to the next donor.",
      });
    }

    return res.status(400).json({
      success: false,
      message: "Unable to accept request due to concurrent state change.",
    });
  }

  const donor = await User.findById(donorId).select("fullName phoneNumber bloodGroup");

  // Step 5: Notify all other held/queued donors that the request has been fulfilled
  await notifyHeldDonorsFulfilled(updatedRequest, donorId);

  // Notify receiver
  await Notification.create({
    recipientId: updatedRequest.requestedBy,
    type: "donor_accepted",
    relatedRequest: updatedRequest._id,
    message: `${donor.fullName} has accepted your blood request! The request is now matched.`,
    priority: "high",
  });

  // Notify hospital if assigned
  if (updatedRequest.assignedHospital) {
    await Notification.create({
      recipientId: updatedRequest.assignedHospital,
      type: "donor_accepted",
      relatedRequest: updatedRequest._id,
      message: `Donor ${donor.fullName} accepted blood request ${updatedRequest._id}.`,
      priority: "high",
    });
  }

  // Record audit log
  await logAuditEvent({
    requestId: updatedRequest._id,
    actor: donorId,
    actorRole: "donor",
    action: "DONOR_ACCEPTED",
    previousStatus: REQUEST_STATUSES.WAITING_FOR_DONOR,
    newStatus: REQUEST_STATUSES.MATCHED,
    metadata: {
      donorId,
      acceptedAt: now,
      totalAcceptances: updatedRequest.acceptedDonors.length,
    },
    note: `Donor ${donor.fullName} accepted the request within the response window`,
  });

  return res.status(200).json({
    success: true,
    message: "Request accepted successfully. Request is now matched.",
    data: {
      requestId: updatedRequest._id,
      status: updatedRequest.status,
      matchedDonor: {
        id: donor._id,
        fullName: donor.fullName,
        bloodGroup: donor.bloodGroup,
      },
      matchedAt: updatedRequest.matchedAt,
    },
  });
});

/**
 * STEP 6: Donor declines the blood request.
 * Automatically escalates to the next-nearest held donor in queue.
 */
exports.rejectRequest = asyncHandler(async (req, res) => {
  const { requestId } = req.params;
  const { rejectionReason } = req.body;
  const donorId = req.user.id;

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

  // Must be in waiting_for_donor or hospital_approved
  if (
    request.status !== REQUEST_STATUSES.WAITING_FOR_DONOR &&
    request.status !== REQUEST_STATUSES.HOSPITAL_APPROVED
  ) {
    return res.status(400).json({
      success: false,
      message: `Cannot decline request in status '${request.status}'`,
    });
  }

  // Verify that the decliner is the active selected donor (or queued)
  const isSelectedDonor =
    request.selectedDonor && request.selectedDonor.toString() === donorId.toString();

  // Add to rejectedDonors array
  request.rejectedDonors.push({
    donor: donorId,
    reason: rejectionReason || "Donor declined request",
    rejectedAt: new Date(),
  });

  // Mark in donorQueue if present
  if (Array.isArray(request.donorQueue)) {
    const qIndex = request.donorQueue.findIndex(
      (item) => item.donor && item.donor.toString() === donorId.toString()
    );
    if (qIndex !== -1) {
      request.donorQueue[qIndex].status = "declined";
    }
  }

  await request.save();

  const donor = await User.findById(donorId).select("fullName");

  // Record audit log for donor decline
  await logAuditEvent({
    requestId: request._id,
    actor: donorId,
    actorRole: "donor",
    action: "DONOR_DECLINED",
    previousStatus: request.status,
    newStatus: request.status,
    metadata: { donorId, rejectionReason },
    note: `Donor ${donor?.fullName || donorId} declined request. Reason: ${rejectionReason || "None provided"}`,
  });

  // If the active selected donor declined, automatically escalate to the next held donor
  let escalationResult = null;
  if (isSelectedDonor && request.status === REQUEST_STATUSES.WAITING_FOR_DONOR) {
    escalationResult = await escalateToNextDonor(request._id, {
      reason: "declined",
      actorId: donorId,
      actorRole: "donor",
      note: rejectionReason || "Donor declined request",
    });
  }

  return res.status(200).json({
    success: true,
    message: "Request declined. System automatically escalated to the next eligible donor.",
    data: {
      requestId: request._id,
      status: escalationResult?.status || request.status,
      escalated: !!escalationResult?.success,
      nextDonorId: escalationResult?.nextDonorId || null,
    },
  });
});

/**
 * Get all blood requests matched or accepted for the logged-in donor.
 */
exports.getDonorAcceptances = asyncHandler(async (req, res) => {
  const donorId = req.user.id;

  const requests = await BloodRequest.find({
    selectedDonor: donorId,
    status: {
      $in: [
        REQUEST_STATUSES.WAITING_FOR_DONOR,
        REQUEST_STATUSES.MATCHED,
        REQUEST_STATUSES.DONOR_ACCEPTED,
        REQUEST_STATUSES.BLOOD_TESTING,
        REQUEST_STATUSES.ADMIN_VERIFIED,
        REQUEST_STATUSES.BLOOD_TEST_SCHEDULED,
        REQUEST_STATUSES.FINAL_COMPLETED,
      ],
    },
  })
    .populate("requestedBy", "fullName phoneNumber location bloodGroup")
    .populate("assignedHospital", "hospitalName hospitalPhone")
    .sort({ createdAt: -1 });

  return res.status(200).json({
    success: true,
    totalRequests: requests.length,
    data: requests,
  });
});