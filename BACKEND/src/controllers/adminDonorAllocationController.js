const mongoose = require("mongoose");
const asyncHandler = require("express-async-handler");
const BloodRequest = require("../model/bloodRequestModel");
const Notification = require("../model/notificationModel");
const User = require("../model/userModel");
const { REQUEST_STATUSES } = require("../utils/stateMachine");
const { widenSearchRadius } = require("../utils/donorSelectionService");

/**
 * Admin manual override: manually trigger radius widening / re-broadcast.
 * Utilizes the shared donorSelectionService widenSearchRadius.
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

  const result = await widenSearchRadius(requestId, {
    actorId: adminId,
    actorRole: "admin",
    note: "Admin manually triggered radius widening",
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
      candidateCount: result.candidateCount,
    },
  });
});

/**
 * Get requests requiring administrative attention (e.g. no donors available or pending hospital approval).
 */
exports.getPendingAdminActions = asyncHandler(async (req, res) => {
  const requests = await BloodRequest.find({
    status: {
      $in: [REQUEST_STATUSES.NO_DONORS_AVAILABLE, REQUEST_STATUSES.PENDING_HOSPITAL_APPROVAL],
    },
  })
    .populate("requestedBy", "fullName bloodGroup location")
    .populate("candidatePool.donor", "fullName location bloodGroup")
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
      candidatePoolSize: r.candidatePool?.length || 0,
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
    .populate("confirmedDonor", "fullName location phoneNumber bloodGroup")
    .sort({ updatedAt: -1 });

  res.status(200).json({
    success: true,
    totalActive: requests.length,
    requests: requests.map((r) => ({
      requestId: r._id,
      receiver: r.requestedBy,
      confirmedDonor: r.confirmedDonor,
      bloodGroup: r.bloodGroup,
      emergencyLevel: r.emergencyLevel,
      acceptanceDeadline: r.acceptanceDeadline,
      waitingSince: r.updatedAt,
      status: r.status,
    })),
  });
});

/**
 * Get request details including full candidate pool.
 */
exports.getRequestWithDonorQueue = asyncHandler(async (req, res) => {
  const { requestId } = req.params;

  const request = await BloodRequest.findById(requestId)
    .populate("requestedBy", "fullName email phoneNumber location")
    .populate("candidatePool.donor", "fullName email phoneNumber location bloodGroup availabilityStatus")
    .populate("confirmedDonor", "fullName email phoneNumber bloodGroup");

  if (!request) {
    return res.status(404).json({
      success: false,
      message: "Request not found",
    });
  }

  const acceptedIds = new Set((request.acceptedDonors || []).map((a) => a.donor.toString()));
  const rejectedIds = new Set((request.rejectedDonors || []).map((r) => r.donor.toString()));

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
        acceptanceDeadline: request.acceptanceDeadline,
      },
      candidatePool: (request.candidatePool || []).map((item) => {
        const donorIdStr = (item.donor?._id || item.donor).toString();
        return {
          donor: item.donor,
          distanceKm: item.distanceKm,
          searchRadiusKm: item.searchRadiusKm,
          addedAt: item.addedAt,
          hasAccepted: acceptedIds.has(donorIdStr),
          hasDeclined: rejectedIds.has(donorIdStr),
        };
      }),
      confirmedDonor: request.confirmedDonor,
      acceptanceDeadline: request.acceptanceDeadline,
    },
  });
});