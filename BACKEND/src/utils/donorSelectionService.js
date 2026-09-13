const mongoose = require("mongoose");
const User = require("../model/userModel");
const BloodRequest = require("../model/bloodRequestModel");
const Notification = require("../model/notificationModel");
const { getCompatibleBloodGroups } = require("./bloodCompatibility");
const { REQUEST_STATUSES, validateTransition } = require("./stateMachine");
const { logAuditEvent } = require("./auditLogger");

// Configurable response window per emergency level (in milliseconds)
const EMERGENCY_TIMEOUT_MS = {
  critical: 15 * 60 * 1000,  // 15 mins
  high: 30 * 60 * 1000,      // 30 mins
  medium: 60 * 60 * 1000,    // 60 mins
  low: 120 * 60 * 1000,      // 120 mins
};

const DEFAULT_MAX_DISTANCE_KM = 50;
const DEFAULT_DONOR_LIMIT = 10;

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

  // Case 3: Object { lat, lng }
  if (typeof coords.lat === "number" && typeof coords.lng === "number") {
    return [coords.lng, coords.lat];
  }

  return null;
}

/**
 * Find and rank eligible donors by distance using MongoDB's 2dsphere index.
 * Uses $geoNear aggregation when coordinates are present, or fallback query when absent.
 * 
 * @param {BloodRequest} request - The BloodRequest document
 * @param {Object} [options]
 * @param {number} [options.limit=10] - Maximum number of donors to pre-queue
 * @param {number} [options.maxDistanceKm=50] - Maximum search radius in kilometers
 * @returns {Promise<Array<{ donor: User, distanceKm: number }>>}
 */
async function findAndRankEligibleDonors(request, options = {}) {
  const limit = options.limit || DEFAULT_DONOR_LIMIT;
  const maxDistanceKm = options.maxDistanceKm || DEFAULT_MAX_DISTANCE_KM;
  const compatibleGroups = getCompatibleBloodGroups(request.bloodGroup);

  // Exclude previously rejected donors for this request
  const excludedDonorIds = (request.rejectedDonors || []).map((item) =>
    item.donor?._id || item.donor
  );

  const parsedCoords = parseCoordinates(request.location);

  // Base matching query for active, verified, compatible donors
  const baseMatchQuery = {
    role: "donor",
    bloodGroup: { $in: compatibleGroups },
    availabilityStatus: "available",
    isVerified: true,
    isBlocked: { $ne: true },
    _id: { $nin: excludedDonorIds },
  };

  // If valid coordinates exist, execute geospatial query utilizing 2dsphere index
  if (parsedCoords) {
    const [lng, lat] = parsedCoords;
    const maxDistanceMeters = maxDistanceKm * 1000;

    try {
      const geoResults = await User.aggregate([
        {
          $geoNear: {
            near: { type: "Point", coordinates: [lng, lat] },
            distanceField: "distanceMeters",
            maxDistance: maxDistanceMeters,
            spherical: true,
            query: baseMatchQuery,
          },
        },
        { $limit: limit },
      ]);

      if (geoResults.length > 0) {
        return geoResults.map((doc) => ({
          donor: doc,
          distanceKm: Math.round((doc.distanceMeters / 1000) * 10) / 10,
        }));
      }
    } catch (geoError) {
      console.warn("Geospatial aggregation failed, falling back to standard query:", geoError.message);
    }
  }

  // Fallback: Query matching donors without geospatial sorting if coordinates absent or query fails
  const fallbackDonors = await User.find(baseMatchQuery)
    .limit(limit)
    .lean();

  return fallbackDonors.map((doc) => ({
    donor: doc,
    distanceKm: 0,
  }));
}

/**
 * Send notification to a newly selected active donor.
 * @param {BloodRequest} request 
 * @param {ObjectId|string} donorId 
 * @param {Date} deadline 
 * @param {number} distanceKm 
 */
async function notifySelectedDonor(request, donorId, deadline, distanceKm = 0) {
  const receiver = await User.findById(request.requestedBy).select("fullName");
  const receiverName = receiver ? receiver.fullName : "Patient";
  const minutes = Math.round((deadline.getTime() - Date.now()) / 60000);
  const distanceStr = distanceKm > 0 ? ` (${distanceKm} km away)` : "";

  await Notification.create({
    recipientId: donorId,
    type: "blood_request",
    relatedRequest: request._id,
    priority: request.emergencyLevel === "critical" ? "critical" : "high",
    message: `Urgent: Blood group ${request.bloodGroup} needed for ${receiverName}${distanceStr}. Please accept within ${minutes} minutes.`,
  });
}

/**
 * Escalate request to the next held donor in queue, or mark as exhausted if none remain.
 * 
 * @param {string|mongoose.Types.ObjectId} requestId 
 * @param {Object} options
 * @param {string} options.reason - "timeout" | "declined"
 * @param {string|mongoose.Types.ObjectId|null} [options.actorId=null]
 * @param {string} [options.actorRole="system"]
 * @param {string} [options.note=""]
 * @returns {Promise<{ success: boolean, status: string, nextDonorId: string|null, message: string }>}
 */
async function escalateToNextDonor(requestId, { reason, actorId = null, actorRole = "system", note = "" }) {
  const request = await BloodRequest.findById(requestId);

  if (!request) {
    return { success: false, status: null, nextDonorId: null, message: "Blood request not found" };
  }

  // Can only escalate if currently in waiting_for_donor
  if (request.status !== REQUEST_STATUSES.WAITING_FOR_DONOR) {
    return {
      success: false,
      status: request.status,
      nextDonorId: null,
      message: `Cannot escalate request in status '${request.status}'`,
    };
  }

  const previousStatus = request.status;
  const previousDonorId = request.selectedDonor;

  // Mark previous donor queue entry as declined or timeout
  if (previousDonorId && Array.isArray(request.donorQueue)) {
    const currentIndex = request.donorQueue.findIndex(
      (item) => item.donor && item.donor.toString() === previousDonorId.toString()
    );
    if (currentIndex !== -1) {
      request.donorQueue[currentIndex].status = reason === "timeout" ? "timeout" : "declined";
    }
  }

  // Find next held donor in queue
  const nextQueueItemIndex = request.donorQueue.findIndex(
    (item) => item.status === "held" || item.status === "pending"
  );

  if (nextQueueItemIndex !== -1) {
    // Next donor available!
    const nextItem = request.donorQueue[nextQueueItemIndex];
    const nextDonorId = nextItem.donor;
    const timeoutMs = getResponseTimeoutMs(request.emergencyLevel);
    const deadline = new Date(Date.now() + timeoutMs);

    nextItem.status = "notified";
    nextItem.notificationSentAt = new Date();
    nextItem.responseDeadline = deadline;

    request.currentDonorIndex = nextQueueItemIndex;
    request.selectedDonor = nextDonorId;
    request.donorResponseDeadline = deadline;
    request.status = REQUEST_STATUSES.WAITING_FOR_DONOR;

    await request.save();

    // Send targeted notification to new active donor
    await notifySelectedDonor(request, nextDonorId, deadline, nextItem.distanceKm);

    // Notify receiver about escalation
    await Notification.create({
      recipientId: request.requestedBy,
      type: "donor_timeout_escalated",
      relatedRequest: request._id,
      message: `Previous donor did not respond. Request automatically escalated to next nearest eligible donor.`,
    });

    // Notify hospital if assigned
    if (request.assignedHospital) {
      await Notification.create({
        recipientId: request.assignedHospital,
        type: "donor_timeout_escalated",
        relatedRequest: request._id,
        message: `Request for ${request.bloodGroup} escalated to next donor (queue position ${nextQueueItemIndex + 1}).`,
      });
    }

    // Write audit log
    await logAuditEvent({
      requestId: request._id,
      actor: actorId,
      actorRole,
      action: reason === "timeout" ? "DONOR_TIMEOUT_ESCALATED" : "DONOR_DECLINED_ESCALATED",
      previousStatus,
      newStatus: request.status,
      metadata: {
        previousDonorId,
        nextDonorId,
        nextQueueIndex: nextQueueItemIndex,
        deadline,
        reason,
      },
      note: note || `Escalated from donor ${previousDonorId} to ${nextDonorId} due to ${reason}`,
    });

    return {
      success: true,
      status: request.status,
      nextDonorId: nextDonorId.toString(),
      message: "Escalated to next eligible donor",
    };
  } else {
    // Queue exhausted! Mark request as no_donors_available
    validateTransition(request.status, REQUEST_STATUSES.NO_DONORS_AVAILABLE);

    request.status = REQUEST_STATUSES.NO_DONORS_AVAILABLE;
    request.selectedDonor = null;
    request.donorResponseDeadline = null;
    request.allDonorsRejected = true;

    await request.save();

    // Notify receiver
    await Notification.create({
      recipientId: request.requestedBy,
      type: "no_donors_available",
      relatedRequest: request._id,
      priority: "critical",
      message: `All nearby eligible donors have been contacted and are unavailable. Please contact the hospital directly for emergency reserves.`,
    });

    // Notify hospital
    if (request.assignedHospital) {
      await Notification.create({
        recipientId: request.assignedHospital,
        type: "no_donors_available",
        relatedRequest: request._id,
        priority: "high",
        message: `Donor queue exhausted for blood request ${request._id} (${request.bloodGroup}). No donors available.`,
      });
    }

    // Lookup and notify all admin users
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

    // Write audit log
    await logAuditEvent({
      requestId: request._id,
      actor: actorId,
      actorRole,
      action: "ALL_DONORS_EXHAUSTED",
      previousStatus,
      newStatus: REQUEST_STATUSES.NO_DONORS_AVAILABLE,
      metadata: { previousDonorId, totalQueued: request.donorQueue?.length || 0, reason },
      note: `Queue exhausted after ${reason}. Marked as no_donors_available.`,
    });

    return {
      success: true,
      status: REQUEST_STATUSES.NO_DONORS_AVAILABLE,
      nextDonorId: null,
      message: "No donors available. Queue exhausted.",
    };
  }
}

/**
 * Notify all other held/queued donors that the blood request has been fulfilled.
 * @param {BloodRequest} request 
 * @param {string|mongoose.Types.ObjectId} acceptedDonorId 
 */
async function notifyHeldDonorsFulfilled(request, acceptedDonorId) {
  if (!request.donorQueue || request.donorQueue.length === 0) return;

  const heldDonors = request.donorQueue.filter((item) => {
    const donorIdStr = (item.donor?._id || item.donor).toString();
    return donorIdStr !== acceptedDonorId.toString() && (item.status === "held" || item.status === "pending");
  });

  for (const item of heldDonors) {
    const donorId = item.donor?._id || item.donor;
    item.status = "exhausted";

    await Notification.create({
      recipientId: donorId,
      type: "request_fulfilled",
      relatedRequest: request._id,
      message: `The blood request for ${request.bloodGroup} has been fulfilled by another donor. Thank you for your readiness to help!`,
    });
  }

  await logAuditEvent({
    requestId: request._id,
    actor: acceptedDonorId,
    actorRole: "donor",
    action: "HELD_DONORS_NOTIFIED_FULFILLED",
    previousStatus: request.status,
    newStatus: request.status,
    metadata: { heldDonorsCount: heldDonors.length, acceptedDonorId },
    note: `Notified ${heldDonors.length} held donors that request was fulfilled`,
  });
}

module.exports = {
  findAndRankEligibleDonors,
  notifySelectedDonor,
  escalateToNextDonor,
  notifyHeldDonorsFulfilled,
  getResponseTimeoutMs,
  parseCoordinates,
};
