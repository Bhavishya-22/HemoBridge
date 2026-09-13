// hospitalVerifyRequestController.js
const mongoose = require("mongoose");
const asyncHandler = require("express-async-handler");
const BloodRequest = require("../model/bloodRequestModel");
const Notification = require("../model/notificationModel");
const User = require("../model/userModel");
const {
  findAndRankEligibleDonors,
  notifySelectedDonor,
  getResponseTimeoutMs,
} = require("../utils/donorSelectionService");
const { REQUEST_STATUSES, validateTransition } = require("../utils/stateMachine");
const { logAuditEvent } = require("../utils/auditLogger");

/**
 * STEP 2: Hospital approves the blood request (Fraud/Fake-request checkpoint).
 * Automatically finds eligible donors via 2dsphere geo-index, notifies the single nearest donor,
 * queues the next-nearest donors in "held" status, and logs audit events.
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

  // Enforce checkpoint: must be in pending_hospital_approval
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

  const previousStatus = request.status;

  // Validate state machine transition to hospital_approved
  validateTransition(previousStatus, REQUEST_STATUSES.HOSPITAL_APPROVED);

  request.hospitalApproved = true;
  request.hospitalApprovedBy = hospitalId;
  request.hospitalApprovedAt = new Date();
  request.assignedHospital = hospitalId;
  request.status = REQUEST_STATUSES.HOSPITAL_APPROVED;

  // Log hospital approval audit event
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

  // STEP 3: Automatically find and rank eligible donors using MongoDB 2dsphere index ($geoNear)
  const rankedDonors = await findAndRankEligibleDonors(request, {
    limit: 10,
    maxDistanceKm: 50,
  });

  if (rankedDonors.length === 0) {
    // No eligible donors available in vicinity
    validateTransition(request.status, REQUEST_STATUSES.NO_DONORS_AVAILABLE);
    request.status = REQUEST_STATUSES.NO_DONORS_AVAILABLE;
    request.donorQueue = [];
    request.currentDonorIndex = 0;
    request.selectedDonor = null;
    request.allDonorsRejected = true;

    await request.save();

    // Notify receiver
    await Notification.create({
      recipientId: request.requestedBy,
      relatedRequest: request._id,
      type: "no_donors_available",
      priority: "high",
      message: `Your request was approved by the hospital, but no eligible nearby donors are currently available. Please contact hospital staff.`,
    });

    // Notify admins (Fix: query actual admin users instead of placeholder)
    const admins = await User.find({ role: "admin" }).select("_id");
    for (const admin of admins) {
      await Notification.create({
        recipientId: admin._id,
        type: "no_donors_available",
        relatedRequest: request._id,
        priority: "high",
        message: `Approved request ${request._id} (${request.bloodGroup}) has no available donors nearby.`,
      });
    }

    await logAuditEvent({
      requestId: request._id,
      actor: hospitalId,
      actorRole: "hospital",
      action: "NO_DONORS_AVAILABLE",
      previousStatus: REQUEST_STATUSES.HOSPITAL_APPROVED,
      newStatus: REQUEST_STATUSES.NO_DONORS_AVAILABLE,
      metadata: { searchRadiusKm: 50 },
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

  // STEP 4: Build donorQueue with the nearest donor selected and remaining held
  const timeoutMs = getResponseTimeoutMs(request.emergencyLevel);
  const deadline = new Date(Date.now() + timeoutMs);

  const nearestDonorItem = rankedDonors[0];
  const firstDonorId = nearestDonorItem.donor._id || nearestDonorItem.donor;

  request.donorQueue = rankedDonors.map((item, index) => {
    const donorId = item.donor._id || item.donor;
    const isFirst = index === 0;
    return {
      donor: donorId,
      distanceKm: item.distanceKm,
      sortedIndex: index,
      queuedAt: new Date(),
      notificationSentAt: isFirst ? new Date() : null,
      responseDeadline: isFirst ? deadline : null,
      status: isFirst ? "notified" : "held",
    };
  });

  // Validate and advance state to waiting_for_donor
  validateTransition(request.status, REQUEST_STATUSES.WAITING_FOR_DONOR);

  request.currentDonorIndex = 0;
  request.selectedDonor = firstDonorId;
  request.donorResponseDeadline = deadline;
  request.status = REQUEST_STATUSES.WAITING_FOR_DONOR;

  await request.save();

  // Notify the single nearest eligible donor first
  await notifySelectedDonor(request, firstDonorId, deadline, nearestDonorItem.distanceKm);

  // Notify receiver
  await Notification.create({
    recipientId: request.requestedBy,
    relatedRequest: request._id,
    type: "hospital_approved",
    message: `Your blood request has been verified and approved by the hospital. Nearest donor notified!`,
  });

  // Fix Flaw 3: Notify actual admin users instead of hardcoded literal string "ADMIN_ID_HERE"
  const admins = await User.find({ role: "admin" }).select("_id");
  for (const admin of admins) {
    await Notification.create({
      recipientId: admin._id,
      type: "new_approved_request",
      relatedRequest: request._id,
      message: `Hospital approved request for ${request.bloodGroup}. Automatically assigned nearest donor from ${rankedDonors.length} candidates.`,
      priority: "normal",
    });
  }

  // Audit log for donor allocation
  await logAuditEvent({
    requestId: request._id,
    actor: hospitalId,
    actorRole: "hospital",
    action: "DONOR_NOTIFIED",
    previousStatus: REQUEST_STATUSES.HOSPITAL_APPROVED,
    newStatus: REQUEST_STATUSES.WAITING_FOR_DONOR,
    metadata: {
      selectedDonorId: firstDonorId,
      totalQueued: rankedDonors.length,
      heldDonorsCount: rankedDonors.length - 1,
      distanceKm: nearestDonorItem.distanceKm,
      responseDeadline: deadline,
    },
    note: `Automatically notified nearest donor (${nearestDonorItem.distanceKm} km). Held ${rankedDonors.length - 1} next-nearest donors in queue.`,
  });

  return res.status(200).json({
    success: true,
    message: "Blood request approved successfully. Nearest donor automatically notified.",
    data: {
      requestId: request._id,
      status: request.status,
      selectedDonorId: firstDonorId,
      distanceKm: nearestDonorItem.distanceKm,
      responseDeadline: deadline,
      totalDonorsInQueue: rankedDonors.length,
      heldDonorsCount: rankedDonors.length - 1,
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

  // Validate state transition
  validateTransition(request.status, REQUEST_STATUSES.REJECTED);

  const previousStatus = request.status;
  request.status = REQUEST_STATUSES.REJECTED;
  request.hospitalApproved = false;
  request.selectedDonor = null;
  request.donorResponseDeadline = null;

  await request.save();

  // Notify receiver
  await Notification.create({
    recipientId: request.requestedBy,
    relatedRequest: request._id,
    type: "hospital_rejected",
    priority: "high",
    message: `Your blood request was rejected by the hospital.${rejectionReason ? ` Reason: ${rejectionReason}` : ""}`,
  });

  // Write audit log
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
