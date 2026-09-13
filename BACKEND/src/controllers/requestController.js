// requestController.js
const mongoose = require("mongoose");
const asyncHandler = require("express-async-handler");
const BloodRequest = require("../model/bloodRequestModel");
const Notification = require("../model/notificationModel");
const User = require("../model/userModel");
const AuditLog = require("../model/auditLogModel");
const { getRecipientsForDonor } = require("../utils/bloodCompatibility");
const { REQUEST_STATUSES } = require("../utils/stateMachine");
const { escalateToNextDonor } = require("../utils/donorSelectionService");
const { logAuditEvent } = require("../utils/auditLogger");

/**
 * STEP 1: Receiver creates blood request.
 * Creates request in status "pending_hospital_approval" and writes audit log.
 */
exports.createRequest = asyncHandler(async (req, res) => {
  const { bloodGroup, quantity, emergencyLevel, location, hospitalName, description } = req.body;
  const user = await User.findById(req.user.id);

  if (user.role === "hospital") {
    return res.status(403).json({
      success: false,
      message: "Hospitals cannot create requests directly. Only receivers can create requests.",
    });
  }

  if (!bloodGroup || !quantity) {
    return res.status(400).json({
      success: false,
      message: "Blood group and quantity are required",
    });
  }

  const request = await BloodRequest.create({
    requestedBy: req.user.id,
    bloodGroup: bloodGroup.toUpperCase(),
    quantity,
    emergencyLevel: emergencyLevel || "medium",
    location,
    hospitalName,
    description,
    status: REQUEST_STATUSES.PENDING_HOSPITAL_APPROVAL,
  });

  // Write audit log
  await logAuditEvent({
    requestId: request._id,
    actor: req.user.id,
    actorRole: "receiver",
    action: "REQUEST_CREATED",
    previousStatus: null,
    newStatus: REQUEST_STATUSES.PENDING_HOSPITAL_APPROVAL,
    metadata: {
      bloodGroup: request.bloodGroup,
      quantity: request.quantity,
      emergencyLevel: request.emergencyLevel,
      location,
    },
    note: "Receiver submitted new blood request awaiting hospital verification",
  });

  res.status(201).json({
    success: true,
    message: "Blood request created successfully. Awaiting hospital verification.",
    data: {
      requestId: request._id,
      bloodGroup: request.bloodGroup,
      quantity: request.quantity,
      emergencyLevel: request.emergencyLevel,
      status: request.status,
    },
  });
});

/**
 * Donor views hospital-approved or waiting-for-donor requests compatible with their blood group.
 */
exports.viewRequests = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);

  if (!user || user.role !== "donor") {
    return res.status(200).json({
      success: true,
      totalRequests: 0,
      requests: [],
      message: "Only donors can view requests.",
    });
  }

  // Determine which recipient blood groups this donor can donate to
  const compatibleRecipientGroups = getRecipientsForDonor(user.bloodGroup);

  const requests = await BloodRequest.find({
    status: {
      $in: [
        REQUEST_STATUSES.WAITING_FOR_DONOR,
        REQUEST_STATUSES.MATCHED,
        REQUEST_STATUSES.DONOR_ACCEPTED,
      ],
    },
    bloodGroup: {
      $in: compatibleRecipientGroups,
    },
  })
    .populate("requestedBy", "fullName location")
    .sort({ createdAt: -1 });

  res.status(200).json({
    success: true,
    totalRequests: requests.length,
    requests,
  });
});

/**
 * Receiver views their own requests.
 */
exports.myRequests = asyncHandler(async (req, res) => {
  const requests = await BloodRequest.find({
    requestedBy: req.user.id,
  })
    .populate("selectedDonor", "fullName email phoneNumber bloodGroup")
    .populate("assignedHospital", "fullName hospitalName hospitalPhone")
    .sort({ createdAt: -1 });

  res.status(200).json({
    success: true,
    totalRequests: requests.length,
    requests,
  });
});

/**
 * Hospital views requests pending verification checkpoint.
 */
exports.getHospitalRequests = asyncHandler(async (req, res) => {
  const requests = await BloodRequest.find({
    status: REQUEST_STATUSES.PENDING_HOSPITAL_APPROVAL,
  })
    .populate("requestedBy", "fullName email phoneNumber location")
    .sort({ emergencyLevel: -1, createdAt: -1 });

  res.status(200).json({
    success: true,
    totalRequests: requests.length,
    requests,
  });
});

/**
 * Get request detail with check-on-read timeout evaluation.
 */
exports.getRequestDetail = asyncHandler(async (req, res) => {
  const { requestId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(requestId)) {
    return res.status(400).json({
      success: false,
      message: "Invalid request ID format",
    });
  }

  let request = await BloodRequest.findById(requestId)
    .populate("requestedBy", "fullName email phoneNumber location age bloodGroup")
    .populate("selectedDonor", "fullName email phoneNumber bloodGroup location")
    .populate("assignedHospital", "fullName hospitalName hospitalPhone");

  if (!request) {
    return res.status(404).json({
      success: false,
      message: "Blood request not found",
    });
  }

  // Check-on-read: If donor deadline passed while waiting for donor, trigger escalation immediately
  if (
    request.status === REQUEST_STATUSES.WAITING_FOR_DONOR &&
    request.donorResponseDeadline &&
    request.donorResponseDeadline < new Date()
  ) {
    await escalateToNextDonor(request._id, {
      reason: "timeout",
      actorId: null,
      actorRole: "system",
      note: "Check-on-read: donor response deadline elapsed",
    });
    // Re-fetch updated request
    request = await BloodRequest.findById(requestId)
      .populate("requestedBy", "fullName email phoneNumber location age bloodGroup")
      .populate("selectedDonor", "fullName email phoneNumber bloodGroup location")
      .populate("assignedHospital", "fullName hospitalName hospitalPhone");
  }

  return res.status(200).json({
    success: true,
    data: {
      requestId: request._id,
      receiver: request.requestedBy,
      bloodGroup: request.bloodGroup,
      quantity: request.quantity,
      emergencyLevel: request.emergencyLevel,
      status: request.status,
      hospitalApproved: request.hospitalApproved,
      hospitalApprovedAt: request.hospitalApprovedAt,
      assignedHospital: request.assignedHospital,
      selectedDonor: request.selectedDonor,
      donorResponseDeadline: request.donorResponseDeadline,
      currentDonorIndex: request.currentDonorIndex,
      totalQueuedDonors: request.donorQueue?.length || 0,
      bloodTestResult: request.bloodTestResult,
      createdAt: request.createdAt,
    },
  });
});

/**
 * On-demand timeout check & escalation endpoint.
 */
exports.checkTimeout = asyncHandler(async (req, res) => {
  const { requestId } = req.params;

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

  if (request.status !== REQUEST_STATUSES.WAITING_FOR_DONOR) {
    return res.status(200).json({
      success: true,
      escalated: false,
      message: `Request is in status '${request.status}', not waiting for donor.`,
      status: request.status,
    });
  }

  if (request.donorResponseDeadline && request.donorResponseDeadline < new Date()) {
    const result = await escalateToNextDonor(requestId, {
      reason: "timeout",
      actorId: req.user?.id || null,
      actorRole: req.user?.role || "system",
      note: "Explicit timeout check triggered escalation",
    });

    return res.status(200).json({
      success: true,
      escalated: true,
      message: result.message,
      status: result.status,
      nextDonorId: result.nextDonorId,
    });
  }

  const remainingMs = request.donorResponseDeadline
    ? request.donorResponseDeadline.getTime() - Date.now()
    : 0;

  return res.status(200).json({
    success: true,
    escalated: false,
    message: "Response window has not yet expired.",
    remainingSeconds: Math.max(0, Math.round(remainingMs / 1000)),
    deadline: request.donorResponseDeadline,
    status: request.status,
  });
});

/**
 * View complete audit trail for a blood request.
 */
exports.getRequestAuditTrail = asyncHandler(async (req, res) => {
  const { requestId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(requestId)) {
    return res.status(400).json({
      success: false,
      message: "Invalid request ID format",
    });
  }

  const logs = await AuditLog.find({ requestId })
    .populate("actor", "fullName email role")
    .sort({ createdAt: 1 });

  return res.status(200).json({
    success: true,
    totalLogs: logs.length,
    data: logs,
  });
});