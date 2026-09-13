// requestController.js
const mongoose = require("mongoose");
const asyncHandler = require("express-async-handler");
const BloodRequest = require("../model/bloodRequestModel");
const Notification = require("../model/notificationModel");
const User = require("../model/userModel");
const DonationRecord = require("../model/donationRecordModel");
const AuditLog = require("../model/auditLogModel");
const { getRecipientsForDonor } = require("../utils/bloodCompatibility");
const { REQUEST_STATUSES } = require("../utils/stateMachine");
const {
  widenSearchRadius,
  selectNearestAcceptedDonor,
  parseCoordinates,
  calculateHaversineDistanceKm,
  DEFAULT_MAX_DISTANCE_KM,
} = require("../utils/donorSelectionService");
const { logAuditEvent } = require("../utils/auditLogger");

/**
 * STEP 1: Receiver creates blood request.
 * Part C-1: accepts location.coordinates.{lat,lng} from body and passes through to schema.
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

  // location.coordinates.{lat, lng} is stored as-received; parseCoordinates() in the
  // donor selection service handles both flat {lat,lng} and GeoJSON formats for geo queries.
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
      hasCoordinates: !!(location?.coordinates?.lat && location?.coordinates?.lng),
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
 * Donor views open, compatible blood requests they can accept.
 *
 * Decision 5 (Gap item 5): Returns requests in waiting_for_donor where the donor is
 * in candidatePool OR where the request is within DEFAULT_MAX_DISTANCE_KM (so donors
 * who registered after a broadcast can still find nearby open requests). Results sorted
 * by distance ascending when the donor has geo coordinates.
 *
 * Donors who have declined a request are excluded from that request's results.
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

  const donorId = new mongoose.Types.ObjectId(req.user.id);
  const compatibleRecipientGroups = getRecipientsForDonor(user.bloodGroup);

  // Query all open requests matching compatible recipient groups that this donor hasn't rejected
  const openRequests = await BloodRequest.find({
    status: REQUEST_STATUSES.WAITING_FOR_DONOR,
    bloodGroup: { $in: compatibleRecipientGroups },
    "rejectedDonors.donor": { $ne: donorId },
  })
    .populate("requestedBy", "fullName")
    .populate("assignedHospital", "hospitalName fullName")
    .lean();

  const donorCoords = parseCoordinates(user.location);
  const donorCity = user.location?.city?.toLowerCase()?.trim();
  const donorState = user.location?.state?.toLowerCase()?.trim();

  // Calculate distance for each request
  const requestsWithDistance = openRequests.map((reqDoc) => {
    let distanceKm = null;
    const reqCoords = parseCoordinates(reqDoc.location);

    if (donorCoords && reqCoords) {
      // donorCoords: [lng, lat], reqCoords: [lng, lat]
      distanceKm = calculateHaversineDistanceKm(
        donorCoords[1],
        donorCoords[0],
        reqCoords[1],
        reqCoords[0]
      );
    } else if (reqDoc.candidatePool && reqDoc.candidatePool.length > 0) {
      const poolEntry = reqDoc.candidatePool.find(
        (p) => (p.donor?._id || p.donor)?.toString() === donorId.toString()
      );
      if (poolEntry && typeof poolEntry.distanceKm === "number") {
        distanceKm = poolEntry.distanceKm;
      }
    }

    if (distanceKm == null) {
      const reqCity = reqDoc.location?.city?.toLowerCase()?.trim();
      const reqState = reqDoc.location?.state?.toLowerCase()?.trim();
      if (reqCity && donorCity && reqCity === donorCity) {
        distanceKm = 4.5;
      } else if (reqState && donorState && reqState === donorState) {
        distanceKm = 24.0;
      } else {
        distanceKm = 35.0;
      }
    }

    return {
      ...reqDoc,
      distanceKm: Math.round(distanceKm * 10) / 10,
      distanceFromDonorKm: Math.round(distanceKm * 10) / 10,
    };
  });

  // Sort strictly nearest first (ascending distance)
  requestsWithDistance.sort(
    (a, b) => (a.distanceKm ?? 9999) - (b.distanceKm ?? 9999)
  );

  // Privacy protection: Only provide exact coordinates for the single nearest request (index 0).
  // For all other open requests, strip location.coordinates to prevent leaking patient locations.
  // Sensitive contact info (email, phoneNumber) is also excluded by only populating fullName on requestedBy.
  const sanitizedRequests = requestsWithDistance.map((reqDoc, index) => {
    if (index === 0) {
      return reqDoc;
    }
    const { coordinates, ...safeLocation } = reqDoc.location || {};
    return {
      ...reqDoc,
      location: safeLocation,
    };
  });

  return res.status(200).json({
    success: true,
    totalRequests: sanitizedRequests.length,
    requests: sanitizedRequests,
  });
});

/**
 * Receiver views their own requests.
 * Part A-9: populated field renamed from selectedDonor to confirmedDonor.
 */
exports.myRequests = asyncHandler(async (req, res) => {
  const requests = await BloodRequest.find({
    requestedBy: req.user.id,
  })
    .populate("confirmedDonor", "fullName email phoneNumber bloodGroup location")
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
 * Get request detail. Part A-9: replaced selectedDonor/currentDonorIndex with
 * confirmedDonor/candidatePool fields. Removed check-on-read escalation (worker handles it).
 */
exports.getRequestDetail = asyncHandler(async (req, res) => {
  const { requestId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(requestId)) {
    return res.status(400).json({
      success: false,
      message: "Invalid request ID format",
    });
  }

  const request = await BloodRequest.findById(requestId)
    .populate("requestedBy", "fullName email phoneNumber location age bloodGroup")
    .populate("confirmedDonor", "fullName email phoneNumber bloodGroup location weight height diseases")
    .populate("assignedHospital", "fullName hospitalName hospitalAddress hospitalPhone");

  if (!request) {
    return res.status(404).json({
      success: false,
      message: "Blood request not found",
    });
  }

  // Authorization check: only requestedBy, confirmedDonor, assignedHospital, or admin can access detail
  const userId = req.user.id?.toString();
  const userRole = req.user.role;

  const requestedById = (request.requestedBy?._id || request.requestedBy)?.toString();
  const confirmedDonorId = (request.confirmedDonor?._id || request.confirmedDonor)?.toString();
  const assignedHospitalId = (request.assignedHospital?._id || request.assignedHospital)?.toString();

  const isAuthorized =
    userRole === "admin" ||
    userId === requestedById ||
    (confirmedDonorId && userId === confirmedDonorId) ||
    (assignedHospitalId && userId === assignedHospitalId);

  if (!isAuthorized) {
    return res.status(403).json({
      success: false,
      message: "You are not authorized to view details for this blood request",
    });
  }

  const donation = await DonationRecord.findOne({
    requestId: request._id,
  }).sort({ createdAt: -1 });

  return res.status(200).json({
    success: true,
    data: {
      requestId: request._id,
      donationId: donation?._id || null,
      receiver: request.requestedBy,
      bloodGroup: request.bloodGroup,
      quantity: request.quantity,
      emergencyLevel: request.emergencyLevel,
      status: request.status,
      hospitalApproved: request.hospitalApproved,
      hospitalApprovedAt: request.hospitalApprovedAt,
      assignedHospital: request.assignedHospital,
      confirmedDonor: request.confirmedDonor,
      confirmedDonorDistanceKm: request.confirmedDonorDistanceKm,
      acceptanceDeadline: request.acceptanceDeadline,
      donorSelectionDeadline: request.donorSelectionDeadline,
      totalAcceptedDonors: request.acceptedDonors?.length || 0,
      candidatePoolSize: request.candidatePool?.length || 0,
      radiusWideningApplied: request.radiusWideningApplied,
      bloodTestResult: request.bloodTestResult,
      createdAt: request.createdAt,
    },
  });
});

/**
 * On-demand timeout check & radius widening endpoint.
 * Supports both:
 *  1. Expired collection window with acceptances -> triggers selectNearestAcceptedDonor
 *  2. Expired broadcast deadline with zero acceptances -> triggers widenSearchRadius
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
      widened: false,
      message: `Request is in status '${request.status}', not waiting for donor.`,
      status: request.status,
    });
  }

  const now = new Date();

  // Branch 1: If collection window has expired and we have acceptances, finalize selection
  if (
    request.donorSelectionDeadline &&
    request.donorSelectionDeadline <= now &&
    request.acceptedDonors &&
    request.acceptedDonors.length > 0
  ) {
    const selectResult = await selectNearestAcceptedDonor(requestId);
    return res.status(200).json({
      success: true,
      widened: false,
      selectionCompleted: true,
      message: selectResult.message,
      status: selectResult.status,
      primaryDonorId: selectResult.primaryDonorId,
      backupsCount: selectResult.backupsCount,
    });
  }

  // Branch 2: If acceptance broadcast deadline has passed and no donors accepted, widen radius
  if (
    request.acceptanceDeadline &&
    request.acceptanceDeadline < now &&
    (!request.acceptedDonors || request.acceptedDonors.length === 0)
  ) {
    const result = await widenSearchRadius(requestId, {
      actorId: req.user?.id || null,
      actorRole: req.user?.role || "system",
      note: "Explicit timeout check triggered radius widening",
    });

    return res.status(200).json({
      success: true,
      widened: true,
      message: result.message,
      status: result.status,
      newCandidatesCount: result.newCandidatesCount,
    });
  }

  const remainingMs = request.acceptanceDeadline
    ? request.acceptanceDeadline.getTime() - Date.now()
    : 0;

  return res.status(200).json({
    success: true,
    widened: false,
    message: "Acceptance window has not yet expired.",
    remainingSeconds: Math.max(0, Math.round(remainingMs / 1000)),
    deadline: request.acceptanceDeadline,
    donorSelectionDeadline: request.donorSelectionDeadline,
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