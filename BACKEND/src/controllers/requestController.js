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
 * Hospital routing:
 *  - presenceMode "at_hospital" → auto-match nearest verified hospital by patient coordinates.
 *  - presenceMode "remote"      → receiver explicitly designates a hospitalId (required).
 * In both cases the matched hospital ID is stored as preferredHospital so only that
 * hospital's dashboard will show the request. If no match is found, preferredHospital
 * remains null and ALL hospitals see the request as a fallback.
 */
exports.createRequest = asyncHandler(async (req, res) => {
  const {
    bloodGroup,
    quantity,
    emergencyLevel,
    location,
    hospitalName,
    description,
    presenceMode,
    preferredHospital: preferredHospitalId,
    hospitalLocation,
  } = req.body;

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

  const mode = presenceMode === "remote" ? "remote" : "at_hospital";

  // ── Resolve preferredHospital ────────────────────────────────────────────────
  let resolvedHospitalId = null;
  let resolvedHospitalLocation = null;

  if (preferredHospitalId && mongoose.Types.ObjectId.isValid(preferredHospitalId)) {
    const hospitalUser = await User.findById(preferredHospitalId);
    if (hospitalUser && hospitalUser.role === "hospital" && hospitalUser.hospitalVerified) {
      resolvedHospitalId = hospitalUser._id;
      resolvedHospitalLocation = {
        address: hospitalUser.hospitalAddress || hospitalLocation?.address || "",
        city: hospitalUser.location?.city || hospitalLocation?.city || "",
        state: hospitalUser.location?.state || hospitalLocation?.state || "",
        coordinates: hospitalUser.location?.coordinates || hospitalLocation?.coordinates,
      };
    }
  }

  // If not resolved by explicit ID, match against verified hospitals by name & address/location
  if (!resolvedHospitalId && (hospitalName || hospitalLocation)) {
    const targetName = (hospitalName || "").trim().toLowerCase();
    const targetCity = (hospitalLocation?.city || location?.city || "").trim().toLowerCase();
    const targetState = (hospitalLocation?.state || location?.state || "").trim().toLowerCase();
    const targetAddress = (hospitalLocation?.address || "").trim().toLowerCase();

    const allVerifiedHospitals = await User.find({
      role: "hospital",
      hospitalVerified: true,
    }).lean();

    const matched = allVerifiedHospitals.find((h) => {
      const hName = (h.hospitalName || h.fullName || "").toLowerCase();
      const hCity = (h.location?.city || "").toLowerCase();
      const hState = (h.location?.state || "").toLowerCase();
      const hAddr = (h.hospitalAddress || "").toLowerCase();

      const nameMatches = targetName && (hName.includes(targetName) || targetName.includes(hName));

      if (nameMatches) {
        if (targetAddress && hAddr && (hAddr.includes(targetAddress) || targetAddress.includes(hAddr))) {
          return true;
        }
        if (targetCity && hCity && targetCity === hCity) {
          return true;
        }
        return true;
      }

      if (targetAddress && hAddr && (hAddr.includes(targetAddress) || targetAddress.includes(hAddr))) {
        if (targetCity && hCity && targetCity === hCity) {
          return true;
        }
      }

      return false;
    });

    if (matched) {
      resolvedHospitalId = matched._id;
      resolvedHospitalLocation = {
        address: matched.hospitalAddress || "",
        city: matched.location?.city || "",
        state: matched.location?.state || "",
        coordinates: matched.location?.coordinates,
      };
    } else {
      resolvedHospitalLocation = hospitalLocation || {
        address: "",
        city: location?.city || "",
        state: location?.state || "",
      };
    }
  }

  // When user is at the hospital, request location inherits the hospital's exact location & address
  let effectiveLocation = location;
  if (mode === "at_hospital") {
    if (resolvedHospitalLocation && (resolvedHospitalLocation.city || resolvedHospitalLocation.address)) {
      effectiveLocation = {
        address: resolvedHospitalLocation.address || location?.address || "",
        city: resolvedHospitalLocation.city || location?.city || "",
        state: resolvedHospitalLocation.state || location?.state || "",
        coordinates: resolvedHospitalLocation.coordinates || location?.coordinates,
      };
    } else if (hospitalLocation) {
      effectiveLocation = {
        address: hospitalLocation.address || location?.address || "",
        city: hospitalLocation.city || location?.city || "",
        state: hospitalLocation.state || location?.state || "",
        coordinates: hospitalLocation.coordinates || location?.coordinates,
      };
    }
  }

  // Validate location based on presence mode
  if (mode === "at_hospital") {
    if (!effectiveLocation?.city || !effectiveLocation?.state) {
      return res.status(400).json({
        success: false,
        message: "Hospital location (city and state) is required when present at the hospital.",
      });
    }
  } else {
    if (!location?.city || !location?.state) {
      return res.status(400).json({
        success: false,
        message: "Your current location (city and state) is required.",
      });
    }
  }

  // location.coordinates.{lat, lng} is stored as-received; parseCoordinates() in the
  // donor selection service handles both flat {lat,lng} and GeoJSON formats for geo queries.
  const request = await BloodRequest.create({
    requestedBy: req.user.id,
    bloodGroup: bloodGroup.toUpperCase(),
    quantity,
    emergencyLevel: emergencyLevel || "medium",
    location: effectiveLocation,
    hospitalName,
    description,
    presenceMode: mode,
    preferredHospital: resolvedHospitalId,
    hospitalLocation: resolvedHospitalLocation || undefined,
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
      hasCoordinates: !!(effectiveLocation?.coordinates?.lat && effectiveLocation?.coordinates?.lng),
      presenceMode: mode,
      preferredHospital: resolvedHospitalId,
      location: effectiveLocation,
    },
    note: "Receiver submitted new blood request awaiting hospital verification",
  });

  res.status(201).json({
    success: true,
    message: resolvedHospitalId
      ? "Blood request created successfully. The designated hospital will review it shortly."
      : "Blood request created successfully. Awaiting hospital verification.",
    data: {
      requestId: request._id,
      bloodGroup: request.bloodGroup,
      quantity: request.quantity,
      emergencyLevel: request.emergencyLevel,
      status: request.status,
      preferredHospital: resolvedHospitalId,
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
 *
 * Hospital routing:
 *  - Returns requests where preferredHospital === this hospital's _id (designated requests).
 *  - Also returns requests where preferredHospital === null (unmatched → visible to all hospitals
 *    as a safety fallback, same as legacy behaviour).
 */
exports.getHospitalRequests = asyncHandler(async (req, res) => {
  const hospitalId = new mongoose.Types.ObjectId(req.user.id);
  const hospital = await User.findById(hospitalId);

  if (!hospital || hospital.role !== "hospital") {
    return res.status(403).json({
      success: false,
      message: "Only hospitals can view hospital requests.",
    });
  }

  const hName = (hospital.hospitalName || hospital.fullName || "").toLowerCase().trim();
  const hCity = (hospital.location?.city || "").toLowerCase().trim();
  const hState = (hospital.location?.state || "").toLowerCase().trim();
  const hAddr = (hospital.hospitalAddress || "").toLowerCase().trim();

  // Find all pending requests
  const pendingRequests = await BloodRequest.find({
    status: REQUEST_STATUSES.PENDING_HOSPITAL_APPROVAL,
  })
    .populate("requestedBy", "fullName email phoneNumber location")
    .populate("preferredHospital", "hospitalName fullName hospitalAddress location")
    .sort({ emergencyLevel: -1, createdAt: -1 });

  // STRICT HOSPITAL ROUTING ISOLATION:
  // Hospital BB with address B must NEVER receive a blood request meant for Hospital AA with address A!
  const filteredRequests = pendingRequests.filter((r) => {
    // 1. Explicit match by ObjectId
    if (r.preferredHospital) {
      const prefId = (r.preferredHospital._id || r.preferredHospital).toString();
      return prefId === hospitalId.toString();
    }

    // 2. Strict match by hospital name and address/city
    const reqHospName = (r.hospitalName || "").toLowerCase().trim();
    const reqHospCity = (r.hospitalLocation?.city || r.location?.city || "").toLowerCase().trim();
    const reqHospState = (r.hospitalLocation?.state || r.location?.state || "").toLowerCase().trim();
    const reqHospAddr = (r.hospitalLocation?.address || "").toLowerCase().trim();

    if (reqHospName) {
      const nameMatches = hName && (hName.includes(reqHospName) || reqHospName.includes(hName));
      if (!nameMatches) {
        return false;
      }
      if (reqHospAddr && hAddr) {
        return hAddr.includes(reqHospAddr) || reqHospAddr.includes(hAddr);
      }
      if (reqHospCity && hCity) {
        return reqHospCity === hCity;
      }
      return true;
    }

    // If no hospital name was given, only match if the city and state match
    if (reqHospCity && hCity && reqHospCity === hCity) {
      if (reqHospState && hState) {
        return reqHospState === hState;
      }
      return true;
    }

    return false;
  });

  res.status(200).json({
    success: true,
    totalRequests: filteredRequests.length,
    requests: filteredRequests,
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