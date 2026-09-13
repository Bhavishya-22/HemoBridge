const mongoose = require("mongoose");
const User = require("../model/userModel");
const BloodRequest = require("../model/bloodRequestModel");
const Notification = require("../model/notificationModel");
const { getCompatibleBloodGroups } = require("./bloodCompatibility");
const { REQUEST_STATUSES, validateTransition } = require("./stateMachine");
const { logAuditEvent } = require("./auditLogger");

// ─── Configurable constants ───────────────────────────────────────────────────
// All values live here so they are easy to adjust without touching logic.

const DEFAULT_MAX_DISTANCE_KM = 50;   // Initial broadcast radius
const WIDENED_MAX_DISTANCE_KM = 100;  // Radius after first timeout widening (2× judgment call)
const DEFAULT_DONOR_LIMIT = 50;       // Max candidates per geo sweep (increased from 10; broadcast model needs more)

// Configurable response window per emergency level (in milliseconds)
const EMERGENCY_TIMEOUT_MS = {
  critical: 15 * 60 * 1000,  // 15 mins
  high:     30 * 60 * 1000,  // 30 mins
  medium:   60 * 60 * 1000,  // 60 mins
  low:     120 * 60 * 1000,  // 120 mins
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Calculate response timeout in milliseconds for an emergency level.
 * @param {string} emergencyLevel
 * @returns {number}
 */
function getResponseTimeoutMs(emergencyLevel) {
  return EMERGENCY_TIMEOUT_MS[emergencyLevel] || EMERGENCY_TIMEOUT_MS.high;
}

/**
 * Extract [longitude, latitude] array from diverse coordinate structures.
 * Handles three formats:
 *   1. GeoJSON:  { type: "Point", coordinates: [lng, lat] }
 *   2. Array:    [lng, lat]
 *   3. Flat obj: { lat, lng }  ← the format bloodRequestModel stores from the frontend
 *
 * @param {Object} location
 * @returns {[number, number]|null} [lng, lat]
 */
function parseCoordinates(location) {
  if (!location || !location.coordinates) return null;

  const coords = location.coordinates;

  // Case 1: GeoJSON format { type: "Point", coordinates: [lng, lat] }
  if (Array.isArray(coords.coordinates) && coords.coordinates.length === 2) {
    const [lng, lat] = coords.coordinates;
    if (typeof lng === "number" && typeof lat === "number") return [lng, lat];
  }

  // Case 2: Array [lng, lat] directly
  if (Array.isArray(coords) && coords.length === 2) {
    const [lng, lat] = coords;
    if (typeof lng === "number" && typeof lat === "number") return [lng, lat];
  }

  // Case 3: Flat { lat, lng } object — the shape the frontend sends and bloodRequestModel stores
  if (typeof coords.lat === "number" && typeof coords.lng === "number") {
    return [coords.lng, coords.lat];
  }

  return null;
}

/**
 * Calculate great-circle distance between two points on Earth in kilometers (Haversine formula).
 * @param {number} lat1
 * @param {number} lon1
 * @param {number} lat2
 * @param {number} lon2
 * @returns {number|null}
 */
function calculateHaversineDistanceKm(lat1, lon1, lat2, lon2) {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return null;
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

// ─── Core service functions ───────────────────────────────────────────────────

/**
 * Find and rank eligible donors by distance using exact coordinates or regional proximity.
 * Strictly sorts nearest-first so the closest compatible donor is prioritized.
 *
 * @param {BloodRequest} request - The BloodRequest document
 * @param {Object} [options]
 * @param {number} [options.limit=50]          - Maximum number of donors to find
 * @param {number} [options.maxDistanceKm=50]  - Maximum search radius in kilometers
 * @param {Array}  [options.excludeIds=[]]     - Additional donor IDs to exclude
 * @returns {Promise<Array<{ donor: User, distanceKm: number, isNearest: boolean }>>}
 */
async function findAndRankEligibleDonors(request, options = {}) {
  const limit = options.limit || DEFAULT_DONOR_LIMIT;
  const maxDistanceKm = options.maxDistanceKm || DEFAULT_MAX_DISTANCE_KM;
  const compatibleGroups = getCompatibleBloodGroups(request.bloodGroup);

  // Exclude donors already in candidatePool or rejectedDonors
  const existingCandidateIds = (request.candidatePool || []).map(
    (item) => item.donor?._id || item.donor
  );
  const excludedRejectedIds = (request.rejectedDonors || []).map(
    (item) => item.donor?._id || item.donor
  );
  const extraExcludeIds = options.excludeIds || [];
  const excludedDonorIds = [
    ...existingCandidateIds,
    ...excludedRejectedIds,
    ...extraExcludeIds,
  ];

  // Base match query: compatible blood group, available status, not blocked
  const baseMatchQuery = {
    role: "donor",
    bloodGroup: { $in: compatibleGroups },
    availabilityStatus: "available",
    isBlocked: { $ne: true },
    _id: { $nin: excludedDonorIds },
  };

  const parsedCoords = parseCoordinates(request.location);
  const reqCity = request.location?.city?.toLowerCase()?.trim();
  const reqState = request.location?.state?.toLowerCase()?.trim();

  // Retrieve all matching candidate donors
  const candidateDocs = await User.find(baseMatchQuery).lean();
  if (!candidateDocs || candidateDocs.length === 0) {
    return [];
  }

  // Calculate distance for each donor using coordinates or location matching
  const ranked = candidateDocs.map((donor) => {
    let distanceKm = null;
    const donorCoords = parseCoordinates(donor.location);

    if (parsedCoords && donorCoords) {
      // Exact GPS coordinates: [lng, lat]
      distanceKm = calculateHaversineDistanceKm(
        parsedCoords[1],
        parsedCoords[0],
        donorCoords[1],
        donorCoords[0]
      );
    } else {
      // Fallback matching by city / state
      const donorCity = donor.location?.city?.toLowerCase()?.trim();
      const donorState = donor.location?.state?.toLowerCase()?.trim();

      if (reqCity && donorCity && reqCity === donorCity) {
        distanceKm = 4.5; // same city
      } else if (reqState && donorState && reqState === donorState) {
        distanceKm = 24.0; // same state
      } else {
        distanceKm = 35.0; // regional fallback
      }
    }

    return {
      donor,
      distanceKm: distanceKm ?? 0,
    };
  });

  // Filter within radius
  const withinRadius = ranked.filter((item) => item.distanceKm <= maxDistanceKm);

  // Sort strictly nearest first (ascending distance)
  withinRadius.sort((a, b) => a.distanceKm - b.distanceKm);

  // Mark the nearest donor
  const results = withinRadius.slice(0, limit).map((item, idx) => ({
    ...item,
    isNearest: idx === 0,
  }));

  return results;
}

/**
 * Send a broadcast notification to every eligible donor in the candidate pool.
 * This is the opt-in model: donors are informed the request exists and must
 * proactively log in and accept — no single donor is pre-selected.
 *
 * PRODUCT DECISION (Part A-6): First-come-first-served acceptance. The first donor
 * to call acceptRequest and win the atomic findOneAndUpdate is confirmed. No grace
 * window is implemented. confirmedDonorDistanceKm is stored for audit transparency
 * and admin re-selection override. If a grace window is needed in future, add a
 * pendingAcceptors[] subdocument here and a per-request micro-task.
 *
 * @param {BloodRequest} request
 * @param {Array<{ donor: User, distanceKm: number }>} candidates
 */
async function broadcastToEligibleDonors(request, candidates) {
  if (!candidates || candidates.length === 0) return;

  for (const { donor, distanceKm } of candidates) {
    const donorId = donor._id || donor;
    const distanceStr = distanceKm > 0 ? ` (~${distanceKm} km from you)` : "";

    await Notification.create({
      recipientId: donorId,
      type: "blood_request",
      relatedRequest: request._id,
      priority: request.emergencyLevel === "critical" ? "critical" : "high",
      message: `A ${request.emergencyLevel} blood request for group ${request.bloodGroup} is open near you${distanceStr}. Log in to accept or decline.`,
    });
  }
}

/**
 * Widen search radius after acceptance deadline expires.
 *
 * Called by:
 *  - timeoutEscalationWorker (background sweep)
 *  - requestController.checkTimeout (on-demand endpoint)
 *  - adminDonorAllocationController.sendRequestToNextDonor (admin manual trigger)
 *
 * Logic:
 *  1. If radiusWideningApplied === true → no more widening possible → transition to no_donors_available.
 *  2. Otherwise: search at WIDENED_MAX_DISTANCE_KM, exclude existing candidatePool + rejectedDonors.
 *  3. If new candidates found: append to candidatePool, broadcast, extend acceptanceDeadline,
 *     set radiusWideningApplied = true.
 *  4. If still zero new candidates → transition to no_donors_available.
 *
 * @param {string|mongoose.Types.ObjectId} requestId
 * @param {Object} opts
 * @param {string|null} [opts.actorId=null]
 * @param {string} [opts.actorRole="system"]
 * @param {string} [opts.note=""]
 * @returns {Promise<{ success: boolean, status: string, newCandidatesCount: number, message: string }>}
 */
async function widenSearchRadius(requestId, { actorId = null, actorRole = "system", note = "" } = {}) {
  const request = await BloodRequest.findById(requestId);

  if (!request) {
    return { success: false, status: null, newCandidatesCount: 0, message: "Blood request not found" };
  }

  if (request.status !== REQUEST_STATUSES.WAITING_FOR_DONOR) {
    return {
      success: false,
      status: request.status,
      newCandidatesCount: 0,
      message: `Cannot widen radius for request in status '${request.status}'`,
    };
  }

  const previousStatus = request.status;

  // ── Branch A: radius already widened once — escalate to no_donors_available ──
  if (request.radiusWideningApplied) {
    validateTransition(request.status, REQUEST_STATUSES.NO_DONORS_AVAILABLE);
    request.status = REQUEST_STATUSES.NO_DONORS_AVAILABLE;
    request.acceptanceDeadline = null;
    await request.save();

    await _notifyNoDonorsAvailable(request);

    await logAuditEvent({
      requestId: request._id,
      actor: actorId,
      actorRole,
      action: "ALL_DONORS_EXHAUSTED",
      previousStatus,
      newStatus: REQUEST_STATUSES.NO_DONORS_AVAILABLE,
      metadata: { candidatePoolSize: request.candidatePool?.length || 0 },
      note: note || "No donors after radius widening. Marked no_donors_available.",
    });

    return {
      success: true,
      status: REQUEST_STATUSES.NO_DONORS_AVAILABLE,
      newCandidatesCount: 0,
      message: "No donors available after radius widening. Request marked no_donors_available.",
    };
  }

  // ── Branch B: first widening attempt ──────────────────────────────────────
  const newCandidates = await findAndRankEligibleDonors(request, {
    limit: DEFAULT_DONOR_LIMIT,
    maxDistanceKm: WIDENED_MAX_DISTANCE_KM,
    // findAndRankEligibleDonors already excludes existing candidatePool & rejectedDonors
  });

  if (newCandidates.length === 0) {
    // Widening found nobody — immediately go to no_donors_available
    validateTransition(request.status, REQUEST_STATUSES.NO_DONORS_AVAILABLE);
    request.status = REQUEST_STATUSES.NO_DONORS_AVAILABLE;
    request.radiusWideningApplied = true;
    request.acceptanceDeadline = null;
    await request.save();

    await _notifyNoDonorsAvailable(request);

    await logAuditEvent({
      requestId: request._id,
      actor: actorId,
      actorRole,
      action: "ALL_DONORS_EXHAUSTED",
      previousStatus,
      newStatus: REQUEST_STATUSES.NO_DONORS_AVAILABLE,
      metadata: { widenedRadiusKm: WIDENED_MAX_DISTANCE_KM },
      note: note || `Widened to ${WIDENED_MAX_DISTANCE_KM} km — still no donors. Marked no_donors_available.`,
    });

    return {
      success: true,
      status: REQUEST_STATUSES.NO_DONORS_AVAILABLE,
      newCandidatesCount: 0,
      message: `Widened radius to ${WIDENED_MAX_DISTANCE_KM} km but found no new candidates.`,
    };
  }

  // Append new candidates to pool
  const newPoolEntries = newCandidates.map(({ donor, distanceKm }) => ({
    donor: donor._id || donor,
    distanceKm,
    searchRadiusKm: WIDENED_MAX_DISTANCE_KM,
    addedAt: new Date(),
  }));

  const newDeadline = new Date(Date.now() + getResponseTimeoutMs(request.emergencyLevel));

  request.candidatePool.push(...newPoolEntries);
  request.acceptanceDeadline = newDeadline;
  request.radiusWideningApplied = true;
  // Status stays WAITING_FOR_DONOR — re-open to new candidates
  await request.save();

  // Broadcast to newly discovered candidates
  await broadcastToEligibleDonors(request, newCandidates);

  // Notify receiver that search was widened
  await Notification.create({
    recipientId: request.requestedBy,
    type: "donor_timeout_escalated",
    relatedRequest: request._id,
    message: `No donors responded in time. Search radius widened to ${WIDENED_MAX_DISTANCE_KM} km — ${newCandidates.length} new donors notified.`,
  });

  if (request.assignedHospital) {
    await Notification.create({
      recipientId: request.assignedHospital,
      type: "donor_timeout_escalated",
      relatedRequest: request._id,
      message: `Request for ${request.bloodGroup} — acceptance window widened. ${newCandidates.length} new candidates added from ${WIDENED_MAX_DISTANCE_KM} km radius.`,
    });
  }

  await logAuditEvent({
    requestId: request._id,
    actor: actorId,
    actorRole,
    action: "RADIUS_WIDENED",
    previousStatus,
    newStatus: request.status,
    metadata: {
      widenedRadiusKm: WIDENED_MAX_DISTANCE_KM,
      newCandidatesCount: newCandidates.length,
      newDeadline,
    },
    note: note || `Widened radius to ${WIDENED_MAX_DISTANCE_KM} km. ${newCandidates.length} new candidates broadcast to.`,
  });

  return {
    success: true,
    status: request.status,
    newCandidatesCount: newCandidates.length,
    message: `Widened to ${WIDENED_MAX_DISTANCE_KM} km. ${newCandidates.length} new donors notified.`,
  };
}

/**
 * Notify all candidatePool members (except the winner) that the request is fulfilled.
 * Adapted from old notifyHeldDonorsFulfilled — now iterates candidatePool.
 *
 * @param {BloodRequest} request
 * @param {string|mongoose.Types.ObjectId} winnerDonorId
 */
async function notifyCandidatesFulfilled(request, winnerDonorId) {
  if (!request.candidatePool || request.candidatePool.length === 0) return;

  const winnerStr = winnerDonorId.toString();
  const others = request.candidatePool.filter((item) => {
    const id = (item.donor?._id || item.donor).toString();
    return id !== winnerStr;
  });

  for (const item of others) {
    const donorId = item.donor?._id || item.donor;
    await Notification.create({
      recipientId: donorId,
      type: "request_fulfilled",
      relatedRequest: request._id,
      message: `The blood request for ${request.bloodGroup} has been fulfilled by another donor. Thank you for your readiness to help!`,
    });
  }

  await logAuditEvent({
    requestId: request._id,
    actor: winnerDonorId,
    actorRole: "donor",
    action: "CANDIDATES_NOTIFIED_FULFILLED",
    previousStatus: request.status,
    newStatus: request.status,
    metadata: { notifiedCount: others.length, winnerDonorId },
    note: `Notified ${others.length} candidates that request was fulfilled`,
  });
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function _notifyNoDonorsAvailable(request) {
  await Notification.create({
    recipientId: request.requestedBy,
    type: "no_donors_available",
    relatedRequest: request._id,
    priority: "critical",
    message: `No eligible donors found within ${WIDENED_MAX_DISTANCE_KM} km. Please contact the hospital directly for emergency reserves.`,
  });

  if (request.assignedHospital) {
    await Notification.create({
      recipientId: request.assignedHospital,
      type: "no_donors_available",
      relatedRequest: request._id,
      priority: "high",
      message: `All searches exhausted for request ${request._id} (${request.bloodGroup}). No donors available.`,
    });
  }

  const admins = await User.find({ role: "admin" }).select("_id");
  for (const admin of admins) {
    await Notification.create({
      recipientId: admin._id,
      type: "no_donors_available",
      relatedRequest: request._id,
      priority: "high",
      message: `Alert: No donors available for request ${request._id} (${request.bloodGroup}). Manual broadcast or reserve allocation required.`,
    });
  }
}

// ─── Nearest donor selection & Backup promotion (Part 1 Redesign) ─────────────

/**
 * Select the nearest accepted donor when the acceptance collection window closes.
 * Ranks all accepted donors strictly by distance (ascending), using acceptance time as tie-breaker.
 * The nearest becomes PRIMARY (confirmedDonor, status: "selected").
 * All other accepted donors become BACKUP (status: "backup").
 * Request status transitions atomically from WAITING_FOR_DONOR to MATCHED.
 *
 * @param {string|mongoose.Types.ObjectId} requestId
 * @returns {Promise<{ success: boolean, status: string|null, primaryDonorId: string|null, backupsCount: number, message: string }>}
 */
async function selectNearestAcceptedDonor(requestId) {
  const request = await BloodRequest.findById(requestId).populate(
    "acceptedDonors.donor",
    "fullName phoneNumber location bloodGroup"
  );
  if (!request) {
    return { success: false, status: null, primaryDonorId: null, backupsCount: 0, message: "Blood request not found" };
  }

  // Must currently be in WAITING_FOR_DONOR
  if (request.status !== REQUEST_STATUSES.WAITING_FOR_DONOR) {
    return {
      success: false,
      status: request.status,
      primaryDonorId: request.confirmedDonor?.toString() || null,
      backupsCount: 0,
      message: `Request is already in status '${request.status}'`,
    };
  }

  // If no donors accepted, cannot select
  if (!request.acceptedDonors || request.acceptedDonors.length === 0) {
    return {
      success: false,
      status: request.status,
      primaryDonorId: null,
      backupsCount: 0,
      message: "No donors have accepted this request",
    };
  }

  const reqCoords = parseCoordinates(request.location);
  const reqCity = request.location?.city?.toLowerCase()?.trim();
  const reqState = request.location?.state?.toLowerCase()?.trim();

  // Attach accurate distance to each accepted donor
  const donorsWithDistance = request.acceptedDonors.map((item) => {
    const donorObj = item.donor;
    const donorIdStr = (donorObj?._id || donorObj).toString();

    const poolEntry = (request.candidatePool || []).find(
      (p) => (p.donor?._id || p.donor).toString() === donorIdStr
    );

    let distanceKm = null;
    if (poolEntry && typeof poolEntry.distanceKm === "number") {
      distanceKm = poolEntry.distanceKm;
    } else if (donorObj && donorObj.location) {
      const donorCoords = parseCoordinates(donorObj.location);
      if (reqCoords && donorCoords) {
        distanceKm = calculateHaversineDistanceKm(reqCoords[1], reqCoords[0], donorCoords[1], donorCoords[0]);
      } else {
        const donorCity = donorObj.location?.city?.toLowerCase()?.trim();
        const donorState = donorObj.location?.state?.toLowerCase()?.trim();
        if (reqCity && donorCity && reqCity === donorCity) distanceKm = 4.5;
        else if (reqState && donorState && reqState === donorState) distanceKm = 24.0;
        else distanceKm = 35.0;
      }
    } else {
      distanceKm = 35.0;
    }

    return {
      donor: donorObj?._id || donorObj,
      donorDoc: donorObj,
      acceptedAt: item.acceptedAt || new Date(),
      distanceKm: distanceKm ?? 9999,
    };
  });

  // Sort strictly nearest first (distance ascending).
  // Tie-breaker: acceptedAt ascending (who accepted earlier).
  donorsWithDistance.sort((a, b) => {
    if (a.distanceKm !== b.distanceKm) {
      return a.distanceKm - b.distanceKm;
    }
    return new Date(a.acceptedAt).getTime() - new Date(b.acceptedAt).getTime();
  });

  const primary = donorsWithDistance[0];
  const primaryDonorId = primary.donor._id || primary.donor;
  const backups = donorsWithDistance.slice(1);

  // Prepare updated acceptedDonors array with primary marked 'selected' and remaining marked 'backup'
  const updatedAcceptedDonors = donorsWithDistance.map((item, idx) => ({
    donor: item.donor._id || item.donor,
    acceptedAt: item.acceptedAt,
    status: idx === 0 ? "selected" : "backup",
  }));

  const now = new Date();

  // ATOMIC TRANSITION from WAITING_FOR_DONOR to MATCHED
  const updated = await BloodRequest.findOneAndUpdate(
    {
      _id: requestId,
      status: REQUEST_STATUSES.WAITING_FOR_DONOR,
    },
    {
      $set: {
        status: REQUEST_STATUSES.MATCHED,
        matchedAt: now,
        confirmedDonor: primaryDonorId,
        confirmedDonorDistanceKm: primary.distanceKm,
        acceptedDonors: updatedAcceptedDonors,
        donorSelectionDeadline: null,
      },
    },
    { returnDocument: "after" }
  );

  if (!updated) {
    // Another concurrent process already performed the transition
    return {
      success: false,
      status: null,
      primaryDonorId: null,
      backupsCount: 0,
      message: "Concurrent selection already executed",
    };
  }

  // ─── Dispatch Notifications ───
  const primaryDonorUser = await User.findById(primaryDonorId).select("fullName phoneNumber bloodGroup");
  const receiverUser = await User.findById(request.requestedBy).select("fullName");

  // 1. Primary donor notification
  await Notification.create({
    recipientId: primaryDonorId,
    type: "admin_selected_for_test",
    relatedRequest: request._id,
    message: `You have been selected as the primary donor for ${receiverUser?.fullName || "the receiver"}'s blood request (${primary.distanceKm} km away). Please proceed to the hospital for testing.`,
    priority: "high",
  });

  // 2. Backup donors notification
  for (const backupItem of backups) {
    const backupId = backupItem.donor._id || backupItem.donor;
    await Notification.create({
      recipientId: backupId,
      type: "donor_on_backup",
      relatedRequest: request._id,
      message: "You are on backup. We will contact you immediately if the primary donor cannot proceed.",
      priority: "normal",
    });
  }

  // 3. Receiver notification
  await Notification.create({
    recipientId: request.requestedBy,
    type: "donor_accepted",
    relatedRequest: request._id,
    message: `${primaryDonorUser?.fullName || "A donor"} (${primary.distanceKm} km away) has been selected as your primary donor! ${backups.length} backup donor(s) on standby.`,
    priority: "high",
  });

  // 4. Hospital notification (if assigned)
  if (request.assignedHospital) {
    await Notification.create({
      recipientId: request.assignedHospital,
      type: "donor_accepted",
      relatedRequest: request._id,
      message: `Nearest donor ${primaryDonorUser?.fullName || "Donor"} (${primary.distanceKm} km) selected as primary for request ${request._id}. ${backups.length} backup(s) on standby.`,
      priority: "high",
    });
  }

  // 5. Notify truly unresponsive candidates in candidatePool (neither accepted nor rejected)
  const acceptedOrRejectedIds = new Set([
    ...updatedAcceptedDonors.map((a) => a.donor.toString()),
    ...(request.rejectedDonors || []).map((r) => (r.donor?._id || r.donor).toString()),
  ]);

  const unresponsiveCandidates = (request.candidatePool || []).filter(
    (c) => !acceptedOrRejectedIds.has((c.donor?._id || c.donor).toString())
  );

  for (const item of unresponsiveCandidates) {
    const candidateId = item.donor?._id || item.donor;
    await Notification.create({
      recipientId: candidateId,
      type: "request_fulfilled",
      relatedRequest: request._id,
      message: `The blood request for group ${request.bloodGroup} has been fulfilled by another donor. Thank you for your readiness to help!`,
    });
  }

  await logAuditEvent({
    requestId: request._id,
    actor: primaryDonorId,
    actorRole: "system",
    action: "NEAREST_DONOR_SELECTED",
    previousStatus: REQUEST_STATUSES.WAITING_FOR_DONOR,
    newStatus: REQUEST_STATUSES.MATCHED,
    metadata: {
      primaryDonorId,
      primaryDistanceKm: primary.distanceKm,
      totalAccepted: donorsWithDistance.length,
      backupsCount: backups.length,
    },
    note: `Selected nearest donor ${primaryDonorUser?.fullName || primaryDonorId} (${primary.distanceKm} km). ${backups.length} backup(s) designated.`,
  });

  return {
    success: true,
    status: REQUEST_STATUSES.MATCHED,
    primaryDonorId: primaryDonorId.toString(),
    backupsCount: backups.length,
    message: `Nearest donor selected successfully. ${backups.length} backup(s) on standby.`,
  };
}

/**
 * Promote the nearest remaining backup donor when a blood test fails.
 * If backups remain, ranks remaining backups by distance ascending (tie-breaker: acceptedAt),
 * assigns the closest backup as confirmedDonor, and keeps/sets status to BLOOD_TEST_SCHEDULED.
 * If all backups are exhausted, resets confirmedDonor and automatically triggers
 * widenSearchRadius / rebroadcast mechanism.
 *
 * @param {string|mongoose.Types.ObjectId} requestId
 * @param {string|mongoose.Types.ObjectId} failedDonorId
 * @param {string} [reason="Blood test failed"]
 * @returns {Promise<{ promoted: boolean, status: string, nextDonor: Object|null, message: string }>}
 */
async function promoteNearestBackupDonor(requestId, failedDonorId, reason = "Blood test failed") {
  const request = await BloodRequest.findById(requestId).populate(
    "acceptedDonors.donor",
    "fullName phoneNumber location bloodGroup"
  );
  if (!request) {
    return { promoted: false, status: null, nextDonor: null, message: "Blood request not found" };
  }

  const failedIdStr = (failedDonorId?._id || failedDonorId || "").toString();

  // 1. Add failed donor to rejectedDonors if not already present
  const alreadyRejected = (request.rejectedDonors || []).some(
    (r) => (r.donor?._id || r.donor).toString() === failedIdStr
  );
  if (!alreadyRejected && failedIdStr) {
    request.rejectedDonors.push({
      donor: failedDonorId,
      reason: reason || "Blood test failed",
      rejectedAt: new Date(),
    });
  }

  // 2. Mark failed donor in acceptedDonors
  (request.acceptedDonors || []).forEach((item) => {
    if ((item.donor?._id || item.donor).toString() === failedIdStr) {
      item.status = "rejected";
    }
  });

  // 3. Notify failed donor
  if (failedIdStr) {
    await Notification.create({
      recipientId: failedDonorId,
      type: "blood_test_failed",
      relatedRequest: request._id,
      message: `Your blood test was not successful. Reason: ${reason || "Blood quality issues"}. Thank you for your willingness to help!`,
    });
  }

  // 4. Find all remaining backup donors who haven't failed/declined
  const allRejectedIds = new Set(
    (request.rejectedDonors || []).map((r) => (r.donor?._id || r.donor).toString())
  );
  if (failedIdStr) allRejectedIds.add(failedIdStr);

  const eligibleBackups = (request.acceptedDonors || []).filter((item) => {
    const dId = (item.donor?._id || item.donor).toString();
    return !allRejectedIds.has(dId) && item.status !== "rejected";
  });

  const reqCoords = parseCoordinates(request.location);

  // Attach distance to each eligible backup
  const backupsWithDistance = eligibleBackups.map((item) => {
    const donorObj = item.donor;
    const donorIdStr = (donorObj?._id || donorObj).toString();

    const poolEntry = (request.candidatePool || []).find(
      (p) => (p.donor?._id || p.donor).toString() === donorIdStr
    );

    let distanceKm = null;
    if (poolEntry && typeof poolEntry.distanceKm === "number") {
      distanceKm = poolEntry.distanceKm;
    } else if (donorObj && donorObj.location) {
      const donorCoords = parseCoordinates(donorObj.location);
      if (reqCoords && donorCoords) {
        distanceKm = calculateHaversineDistanceKm(reqCoords[1], reqCoords[0], donorCoords[1], donorCoords[0]);
      }
    }

    return {
      donor: donorObj?._id || donorObj,
      donorDoc: donorObj,
      acceptedAt: item.acceptedAt || new Date(),
      distanceKm: distanceKm ?? 9999,
    };
  });

  // Sort remaining backups strictly nearest-first
  backupsWithDistance.sort((a, b) => {
    if (a.distanceKm !== b.distanceKm) return a.distanceKm - b.distanceKm;
    return new Date(a.acceptedAt).getTime() - new Date(b.acceptedAt).getTime();
  });

  // 5. Branch: Backups available vs No backups available
  if (backupsWithDistance.length > 0) {
    const promoted = backupsWithDistance[0];
    const promotedDonorId = promoted.donor._id || promoted.donor;

    request.confirmedDonor = promotedDonorId;
    request.confirmedDonorDistanceKm = promoted.distanceKm;
    request.status = REQUEST_STATUSES.BLOOD_TEST_SCHEDULED;
    request.receiverBloodTestConfirmation = null;

    // Update statuses in acceptedDonors
    request.acceptedDonors.forEach((item) => {
      const dId = (item.donor?._id || item.donor).toString();
      if (dId === promotedDonorId.toString()) {
        item.status = "selected";
      } else if (!allRejectedIds.has(dId)) {
        item.status = "backup";
      }
    });

    await request.save();

    const promotedUser = await User.findById(promotedDonorId).select("fullName phoneNumber");
    const receiverUser = await User.findById(request.requestedBy).select("fullName");
    const failedUser = failedIdStr ? await User.findById(failedIdStr).select("fullName") : null;

    // Notify promoted donor
    await Notification.create({
      recipientId: promotedDonorId,
      type: "blood_test_scheduled",
      relatedRequest: request._id,
      message: `Previous donor's blood test was unsuccessful. You have been promoted as the primary donor for ${receiverUser?.fullName || "the receiver"}. Please proceed to the hospital for testing.`,
      priority: "high",
    });

    // Notify receiver
    await Notification.create({
      recipientId: request.requestedBy,
      type: "blood_test_failed_next_donor",
      relatedRequest: request._id,
      message: `Blood test unsuccessful with ${failedUser?.fullName || "previous donor"}. Promoting next nearest backup donor: ${promotedUser?.fullName || "Next donor"} (${promoted.distanceKm} km away).`,
      priority: "high",
    });

    // Notify hospital if assigned
    if (request.assignedHospital) {
      await Notification.create({
        recipientId: request.assignedHospital,
        type: "blood_test_scheduled",
        relatedRequest: request._id,
        message: `Previous donor failed blood test. Nearest backup ${promotedUser?.fullName || "donor"} (${promoted.distanceKm} km) promoted to primary for request ${request._id}.`,
        priority: "high",
      });
    }

    await logAuditEvent({
      requestId: request._id,
      actor: promotedDonorId,
      actorRole: "system",
      action: "BACKUP_DONOR_PROMOTED",
      previousStatus: REQUEST_STATUSES.BLOOD_TEST_SCHEDULED,
      newStatus: REQUEST_STATUSES.BLOOD_TEST_SCHEDULED,
      metadata: {
        failedDonorId: failedIdStr,
        promotedDonorId: promotedDonorId.toString(),
        promotedDistanceKm: promoted.distanceKm,
        remainingBackupsCount: backupsWithDistance.length - 1,
      },
      note: `Promoted nearest backup donor ${promotedUser?.fullName || promotedDonorId} (${promoted.distanceKm} km). ${backupsWithDistance.length - 1} backup(s) remaining.`,
    });

    return {
      promoted: true,
      status: REQUEST_STATUSES.BLOOD_TEST_SCHEDULED,
      nextDonor: {
        id: promotedDonorId,
        fullName: promotedUser?.fullName,
        distanceKm: promoted.distanceKm,
      },
      message: `Blood test failed. Testing next nearest accepted donor (${promotedUser?.fullName || "Donor"}).`,
    };
  } else {
    // ─── No backups remaining: automated re-broadcast / widening flow ───
    request.confirmedDonor = null;
    request.confirmedDonorDistanceKm = null;
    request.receiverBloodTestConfirmation = null;
    request.status = REQUEST_STATUSES.WAITING_FOR_DONOR;
    await request.save();

    // Trigger widenSearchRadius
    const widenResult = await widenSearchRadius(request._id, {
      actorId: null,
      actorRole: "system",
      note: "All accepted backup donors failed blood test. Automatic re-broadcast initiated.",
    });

    if (widenResult.status === REQUEST_STATUSES.NO_DONORS_AVAILABLE) {
      await Notification.create({
        recipientId: request.requestedBy,
        type: "all_donors_exhausted",
        relatedRequest: request._id,
        priority: "critical",
        message: `All tested donors were ineligible, and no additional donors were found in search radius. Please contact hospital staff.`,
      });

      return {
        promoted: false,
        status: REQUEST_STATUSES.NO_DONORS_AVAILABLE,
        nextDonor: null,
        message: "All accepted donors failed blood test. Search radius exhausted with no new donors.",
      };
    } else {
      await Notification.create({
        recipientId: request.requestedBy,
        type: "all_donors_exhausted",
        relatedRequest: request._id,
        priority: "high",
        message: `All tested donors were ineligible. System has automatically expanded search radius and notified ${widenResult.newCandidatesCount} new candidate donors.`,
      });

      return {
        promoted: false,
        status: REQUEST_STATUSES.WAITING_FOR_DONOR,
        nextDonor: null,
        message: `All accepted donors failed blood test. Widened search radius and notified ${widenResult.newCandidatesCount} new candidate(s).`,
      };
    }
  }
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  findAndRankEligibleDonors,
  broadcastToEligibleDonors,
  widenSearchRadius,
  notifyCandidatesFulfilled,
  selectNearestAcceptedDonor,
  promoteNearestBackupDonor,
  getResponseTimeoutMs,
  parseCoordinates,
  calculateHaversineDistanceKm,
  DEFAULT_MAX_DISTANCE_KM,
  WIDENED_MAX_DISTANCE_KM,
};
