const mongoose = require("mongoose");
const asyncHandler = require("express-async-handler");
const BloodRequest = require("../model/bloodRequestModel");
const Notification = require("../model/notificationModel");
const User = require("../model/userModel");
const { REQUEST_STATUSES } = require("../utils/stateMachine");
const { escalateToNextDonor } = require("../utils/donorSelectionService");

/**
 * Admin manual override: manually escalate to the next donor in queue if necessary.
 * Utilizes the shared donorSelectionService.
 */
exports.sendRequestToNextDonor = asyncHandler(async (req, res) => {
  const { requestId } = req.params;
  const adminId = req.user.id;

  if (!mongoose.Types.ObjectId.isValid(requestId)) {
    return res.status(400).json({
      success: false,
      message: "Invalid request ID",
    });
  }

  const result = await escalateToNextDonor(requestId, {
    reason: "admin_override",
    actorId: adminId,
    actorRole: "admin",
    note: "Admin manually triggered escalation to next donor",
  });

  if (!result.success) {
    return res.status(400).json({
      success: false,
      message: result.message,
    });
  }

  return res.status(200).json({
    success: true,
    message: result.message,
    data: {
      requestId,
      status: result.status,
      nextDonorId: result.nextDonorId,
    },
  });
});

/**
 * Get requests requiring administrative attention (e.g. no donors available or pending verification).
 */
exports.getPendingAdminActions = asyncHandler(async (req, res) => {
  const requests = await BloodRequest.find({
    status: {
      $in: [REQUEST_STATUSES.NO_DONORS_AVAILABLE, REQUEST_STATUSES.PENDING_HOSPITAL_APPROVAL],
    },
  })
    .populate("requestedBy", "fullName bloodGroup location")
    .populate("donorQueue.donor", "fullName location bloodGroup")
    .sort({ emergencyLevel: -1, createdAt: -1 });

  res.status(200).json({
    success: true,
    totalPending: requests.length,
    requests: requests.map((r) => ({
      requestId: r._id,
      receiver: r.requestedBy,
      bloodGroup: r.bloodGroup,
      quantity: r.quantity,
      emergencyLevel: r.emergencyLevel,
      totalDonorsInQueue: r.donorQueue?.length || 0,
      status: r.status,
      createdAt: r.createdAt,
    })),
  });
});

/**
 * Get active requests currently waiting for a donor response.
 */
exports.getActiveRequests = asyncHandler(async (req, res) => {
  const requests = await BloodRequest.find({
    status: REQUEST_STATUSES.WAITING_FOR_DONOR,
  })
    .populate("requestedBy", "fullName location")
    .populate("selectedDonor", "fullName location phoneNumber bloodGroup")
    .sort({ updatedAt: -1 });

  res.status(200).json({
    success: true,
    totalActive: requests.length,
    requests: requests.map((r) => ({
      requestId: r._id,
      receiver: r.requestedBy,
      selectedDonor: r.selectedDonor,
      bloodGroup: r.bloodGroup,
      emergencyLevel: r.emergencyLevel,
      donorResponseDeadline: r.donorResponseDeadline,
      waitingSince: r.updatedAt,
      status: r.status,
    })),
  });
});

/**
 * Get request details including full donor queue and held states.
 */
exports.getRequestWithDonorQueue = asyncHandler(async (req, res) => {
  const { requestId } = req.params;

  const request = await BloodRequest.findById(requestId)
    .populate("requestedBy", "fullName email phoneNumber location")
    .populate("donorQueue.donor", "fullName email phoneNumber location bloodGroup availabilityStatus")
    .populate("selectedDonor", "fullName email phoneNumber bloodGroup");

  if (!request) {
    return res.status(404).json({
      success: false,
      message: "Request not found",
    });
  }

  res.status(200).json({
    success: true,
    data: {
      request: {
        requestId: request._id,
        receiver: request.requestedBy,
        bloodGroup: request.bloodGroup,
        quantity: request.quantity,
        emergencyLevel: request.emergencyLevel,
        status: request.status,
        hospitalApprovedAt: request.hospitalApprovedAt,
        donorResponseDeadline: request.donorResponseDeadline,
      },
      donorQueue: (request.donorQueue || []).map((item, index) => ({
        queuePosition: index + 1,
        donor: item.donor,
        distanceKm: item.distanceKm,
        status: item.status,
        notificationSentAt: item.notificationSentAt,
        responseDeadline: item.responseDeadline,
        isCurrentDonor: index === request.currentDonorIndex,
      })),
      selectedDonor: request.selectedDonor,
      currentDonorIndex: request.currentDonorIndex,
    },
  });
});