// hospitalVerifyRequestController.js
const mongoose = require("mongoose");
const asyncHandler = require("express-async-handler");
const BloodRequest = require("../model/bloodRequestModel");
const Notification = require("../model/notificationModel");
const User = require("../model/userModel");
const {
  findAndRankEligibleDonors,
  broadcastToEligibleDonors,       // Part A-4: replaces notifySelectedDonor
  getResponseTimeoutMs,
  DEFAULT_MAX_DISTANCE_KM,
} = require("../utils/donorSelectionService");
const { REQUEST_STATUSES, validateTransition } = require("../utils/stateMachine");
const { logAuditEvent } = require("../utils/auditLogger");

/**
 * STEP 2: Hospital approves the blood request (fraud/fake-request checkpoint).
 *
 * Part A-3/4 redesign: instead of selecting the single nearest donor and queuing
 * the rest, the backend now:
 *  1. Finds ALL eligible donors within DEFAULT_MAX_DISTANCE_KM.
 *  2. Stores them as an open candidatePool — no single donor is pre-selected.
 *  3. Broadcasts a notification to EVERY candidate inviting them to accept.
 *  4. Transitions to waiting_for_donor with an acceptanceDeadline.
 *
 * Any candidate who sees the request on their dashboard and accepts it triggers
 * the atomic match in acceptController.
 */
exports.approveBloodRequest = asyncHandler(async (req, res) => {
  const { requestId } = req.params;
  const hospitalId = req.user.id;

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

  if (request.status !== REQUEST_STATUSES.PENDING_HOSPITAL_APPROVAL) {
    return res.status(400).json({
      success: false,
      message: `Request cannot be approved from status '${request.status}'`,
    });
  }

  if (request.hospitalApproved) {
    return res.status(400).json({
      success: false,
      message: "Request has already been approved",
    });
  }

  // ── Hospital routing guard ────────────────────────────────────────────────
  // If a specific hospital was designated by the receiver, only that hospital
  // may approve this request. Other hospitals get a 403.
  // If preferredHospital is null (unmatched fallback), any verified hospital may approve.
  if (
    request.preferredHospital &&
    request.preferredHospital.toString() !== hospitalId.toString()
  ) {
    return res.status(403).json({
      success: false,
      message:
        "You are not the designated hospital for this blood request. Only the hospital selected by the receiver can approve it.",
    });
  }

  const previousStatus = request.status;
  validateTransition(previousStatus, REQUEST_STATUSES.HOSPITAL_APPROVED);

  request.hospitalApproved = true;
  request.hospitalApprovedBy = hospitalId;
  request.hospitalApprovedAt = new Date();
  request.assignedHospital = hospitalId;
  request.status = REQUEST_STATUSES.HOSPITAL_APPROVED;

  await logAuditEvent({
    requestId: request._id,
    actor: hospitalId,
    actorRole: "hospital",
    action: "HOSPITAL_APPROVED",
    previousStatus,
    newStatus: request.status,
    metadata: { hospitalId },
    note: "Hospital verified and approved blood request as authentic",
  });

  // ── Find all eligible donors within broadcast radius ─────────────────────
  const rankedDonors = await findAndRankEligibleDonors(request, {
    limit: 50,
    maxDistanceKm: DEFAULT_MAX_DISTANCE_KM,
  });

  if (rankedDonors.length === 0) {
    validateTransition(request.status, REQUEST_STATUSES.NO_DONORS_AVAILABLE);
    request.status = REQUEST_STATUSES.NO_DONORS_AVAILABLE;
    request.candidatePool = [];

    await request.save();

    await Notification.create({
      recipientId: request.requestedBy,
      relatedRequest: request._id,
      type: "no_donors_available",
      priority: "high",
      message: `Your request was approved by the hospital, but no eligible nearby donors are currently available. Please contact hospital staff.`,
    });

    const admins = await User.find({ role: "admin" }).select("_id");
    for (const admin of admins) {
      await Notification.create({
        recipientId: admin._id,
        type: "no_donors_available",
        relatedRequest: request._id,
        priority: "high",
        message: `Approved request ${request._id} (${request.bloodGroup}) has no available donors within ${DEFAULT_MAX_DISTANCE_KM} km.`,
      });
    }

    await logAuditEvent({
      requestId: request._id,
      actor: hospitalId,
      actorRole: "hospital",
      action: "NO_DONORS_AVAILABLE",
      previousStatus: REQUEST_STATUSES.HOSPITAL_APPROVED,
      newStatus: REQUEST_STATUSES.NO_DONORS_AVAILABLE,
      metadata: { searchRadiusKm: DEFAULT_MAX_DISTANCE_KM },
      note: "No matching, verified, available donors found within search area",
    });

    return res.status(200).json({
      success: true,
      message: "Blood request approved, but no donors are currently available nearby",
      data: {
        requestId: request._id,
        status: request.status,
        totalDonorsAvailable: 0,
      },
    });
  }

  // ── Build candidatePool and open the acceptance window ───────────────────
  const timeoutMs = getResponseTimeoutMs(request.emergencyLevel);
  const deadline = new Date(Date.now() + timeoutMs);

  request.candidatePool = rankedDonors.map(({ donor, distanceKm }) => ({
    donor: donor._id || donor,
    distanceKm,
    searchRadiusKm: DEFAULT_MAX_DISTANCE_KM,
    addedAt: new Date(),
  }));

  if (rankedDonors.length > 0) {
    request.nearestDonor = {
      donor: rankedDonors[0].donor._id || rankedDonors[0].donor,
      distanceKm: rankedDonors[0].distanceKm,
    };
  }

  validateTransition(request.status, REQUEST_STATUSES.WAITING_FOR_DONOR);

  request.status = REQUEST_STATUSES.WAITING_FOR_DONOR;
  request.acceptanceDeadline = deadline;
  request.donorNotificationSent = true;
  request.lastDonorNotifiedAt = new Date();
  // confirmedDonor intentionally NOT set here — no donor is pre-selected

  await request.save();

  // Broadcast to every candidate — all donors invited to accept
  await broadcastToEligibleDonors(request, rankedDonors);

  // Notify receiver
  await Notification.create({
    recipientId: request.requestedBy,
    relatedRequest: request._id,
    type: "hospital_approved",
    message: `Your blood request has been verified and approved. ${rankedDonors.length} eligible donor(s) have been notified and can now accept your request.`,
  });

  // Notify admins
  const admins = await User.find({ role: "admin" }).select("_id");
  for (const admin of admins) {
    await Notification.create({
      recipientId: admin._id,
      type: "new_approved_request",
      relatedRequest: request._id,
      message: `Hospital approved request for ${request.bloodGroup}. ${rankedDonors.length} candidates notified within ${DEFAULT_MAX_DISTANCE_KM} km.`,
      priority: "normal",
    });
  }

  await logAuditEvent({
    requestId: request._id,
    actor: hospitalId,
    actorRole: "hospital",
    action: "CANDIDATES_BROADCAST",
    previousStatus: REQUEST_STATUSES.HOSPITAL_APPROVED,
    newStatus: REQUEST_STATUSES.WAITING_FOR_DONOR,
    metadata: {
      candidatePoolSize: rankedDonors.length,
      searchRadiusKm: DEFAULT_MAX_DISTANCE_KM,
      acceptanceDeadline: deadline,
    },
    note: `Broadcast to ${rankedDonors.length} eligible donors (radius: ${DEFAULT_MAX_DISTANCE_KM} km). Open acceptance window until ${deadline.toISOString()}.`,
  });

  return res.status(200).json({
    success: true,
    message: `Blood request approved. ${rankedDonors.length} eligible donor(s) notified and can now accept.`,
    data: {
      requestId: request._id,
      status: request.status,
      candidatePoolSize: rankedDonors.length,
      acceptanceDeadline: deadline,
      searchRadiusKm: DEFAULT_MAX_DISTANCE_KM,
    },
  });
});

/**
 * Hospital rejects the blood request during verification checkpoint.
 */
exports.rejectBloodRequest = asyncHandler(async (req, res) => {
  const { requestId } = req.params;
  const { rejectionReason } = req.body;
  const hospitalId = req.user.id;

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

  validateTransition(request.status, REQUEST_STATUSES.REJECTED);

  const previousStatus = request.status;
  request.status = REQUEST_STATUSES.REJECTED;
  request.hospitalApproved = false;
  request.confirmedDonor = null;
  request.acceptanceDeadline = null;

  await request.save();

  await Notification.create({
    recipientId: request.requestedBy,
    relatedRequest: request._id,
    type: "hospital_rejected",
    priority: "high",
    message: `Your blood request was rejected by the hospital.${rejectionReason ? ` Reason: ${rejectionReason}` : ""}`,
  });

  await logAuditEvent({
    requestId: request._id,
    actor: hospitalId,
    actorRole: "hospital",
    action: "HOSPITAL_REJECTED",
    previousStatus,
    newStatus: REQUEST_STATUSES.REJECTED,
    metadata: { rejectionReason },
    note: `Hospital rejected request. Reason: ${rejectionReason || "None provided"}`,
  });

  return res.status(200).json({
    success: true,
    message: "Blood request rejected by hospital",
    data: {
      requestId: request._id,
      status: request.status,
    },
  });
});
