// acceptController.js
const mongoose = require("mongoose");
const asyncHandler = require("express-async-handler");
const BloodRequest = require("../model/bloodRequestModel");
const Notification = require("../model/notificationModel");
const User = require("../model/userModel");
const { REQUEST_STATUSES } = require("../utils/stateMachine");
const {
  selectNearestAcceptedDonor,
  calculateHaversineDistanceKm,
  parseCoordinates,
} = require("../utils/donorSelectionService");
const { isBloodCompatible } = require("../utils/bloodCompatibility");
const { logAuditEvent } = require("../utils/auditLogger");

/**
 * Default collection window in milliseconds (3 minutes default, configurable via env).
 */
const DEFAULT_COLLECTION_WINDOW_MS = 3 * 60 * 1000;

/**
 * STEP 5: Donor accepts the blood request (Multi-donor collection model).
 *
 * Multiple candidate donors can accept while request is in WAITING_FOR_DONOR.
 * First acceptance initializes donorSelectionDeadline (short window).
 * Subsequent acceptances append to acceptedDonors without resetting deadline.
 * Nearest donor is selected when window expires or when all candidates respond.
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
  const donorObjId = new mongoose.Types.ObjectId(donorId);

  const donorUser = await User.findById(donorId);
  if (!donorUser) {
    return res.status(404).json({ success: false, message: "Donor not found" });
  }

  const existing = await BloodRequest.findById(requestId);
  if (!existing) {
    return res.status(404).json({ success: false, message: "Blood request not found" });
  }

  // Pre-validate blood compatibility
  if (!isBloodCompatible(donorUser.bloodGroup, existing.bloodGroup)) {
    return res.status(403).json({
      success: false,
      message: `Your blood group (${donorUser.bloodGroup}) is not compatible with request blood group (${existing.bloodGroup}).`,
    });
  }

  // Verify donor was broadcast to
  const inPool = (existing.candidatePool || []).some(
    (item) => (item.donor?._id || item.donor).toString() === donorId.toString()
  );
  if (!inPool) {
    return res.status(403).json({
      success: false,
      message: "You are not a candidate for this request. Only donors who were broadcast to this request can accept.",
    });
  }

  // Verify donor has not already declined
  const hasDeclined = (existing.rejectedDonors || []).some(
    (item) => (item.donor?._id || item.donor).toString() === donorId.toString()
  );
  if (hasDeclined) {
    return res.status(400).json({
      success: false,
      message: "You have already declined this request.",
    });
  }

  // Verify donor has not already accepted
  const alreadyAccepted = (existing.acceptedDonors || []).some(
    (item) => (item.donor?._id || item.donor).toString() === donorId.toString()
  );
  if (alreadyAccepted) {
    return res.status(400).json({
      success: false,
      message: "You have already accepted this request.",
    });
  }

  // Check overall acceptance deadline
  if (existing.acceptanceDeadline && existing.acceptanceDeadline < now) {
    return res.status(410).json({
      success: false,
      message: "The acceptance window for this request has expired. The search radius may be widening.",
    });
  }

  // Check collection window deadline if already set
  if (existing.donorSelectionDeadline && existing.donorSelectionDeadline < now) {
    return res.status(410).json({
      success: false,
      message: "The donor selection window for this request has already closed.",
    });
  }

  const collectionWindowMs = parseInt(process.env.DONOR_COLLECTION_WINDOW_MS, 10) || DEFAULT_COLLECTION_WINDOW_MS;
  const computedDeadline = new Date(
    Math.min(
      now.getTime() + collectionWindowMs,
      existing.acceptanceDeadline ? existing.acceptanceDeadline.getTime() : now.getTime() + collectionWindowMs
    )
  );

  // ── Atomic accept: append to acceptedDonors & conditionally set donorSelectionDeadline ──
  const updatedRequest = await BloodRequest.findOneAndUpdate(
    {
      _id: requestId,
      status: REQUEST_STATUSES.WAITING_FOR_DONOR,
      "acceptedDonors.donor": { $ne: donorObjId }, // prevent duplicate acceptance
      "rejectedDonors.donor": { $ne: donorObjId }, // must not have declined
      $or: [
        { donorSelectionDeadline: null },
        { donorSelectionDeadline: { $exists: false } },
        { donorSelectionDeadline: { $gte: now } },
      ],
      $and: [
        {
          $or: [
            { acceptanceDeadline: null },
            { acceptanceDeadline: { $exists: false } },
            { acceptanceDeadline: { $gte: now } },
          ],
        },
      ],
    },
    [
      {
        $set: {
          acceptedDonors: {
            $concatArrays: [
              "$acceptedDonors",
              [
                {
                  donor: donorObjId,
                  acceptedAt: now,
                  status: "accepted",
                },
              ],
            ],
          },
          // Set donorSelectionDeadline ONLY if null or not exists; NEVER overwrite if already set
          donorSelectionDeadline: {
            $cond: {
              if: {
                $or: [
                  { $eq: ["$donorSelectionDeadline", null] },
                  { $not: ["$donorSelectionDeadline"] },
                ],
              },
              then: computedDeadline,
              else: "$donorSelectionDeadline",
            },
          },
        },
      },
    ],
    {
      returnDocument: "after",
      updatePipeline: true,
    }
  );

  // ── Failure handling ──
  if (!updatedRequest) {
    const reloaded = await BloodRequest.findById(requestId);

    if (!reloaded) {
      return res.status(404).json({
        success: false,
        message: "Blood request not found",
      });
    }

    if (
      reloaded.status === REQUEST_STATUSES.MATCHED ||
      reloaded.status === REQUEST_STATUSES.FINAL_COMPLETED
    ) {
      return res.status(409).json({
        success: false,
        message: "This blood request has already been matched.",
      });
    }

    if (reloaded.status !== REQUEST_STATUSES.WAITING_FOR_DONOR) {
      return res.status(400).json({
        success: false,
        message: `This request is not open for acceptance. Current status: '${reloaded.status}'`,
      });
    }

    const reloadedAccepted = (reloaded.acceptedDonors || []).some(
      (item) => (item.donor?._id || item.donor).toString() === donorId.toString()
    );
    if (reloadedAccepted) {
      return res.status(400).json({
        success: false,
        message: "You have already accepted this request.",
      });
    }

    if (reloaded.donorSelectionDeadline && reloaded.donorSelectionDeadline < now) {
      return res.status(410).json({
        success: false,
        message: "The donor selection window for this request has closed.",
      });
    }

    if (reloaded.acceptanceDeadline && reloaded.acceptanceDeadline < now) {
      return res.status(410).json({
        success: false,
        message: "The acceptance window for this request has expired.",
      });
    }

    return res.status(400).json({
      success: false,
      message: "Unable to accept request due to concurrent state change. Please refresh.",
    });
  }

  // ── Calculate donor distance for audit log ──
  let distanceKm = null;
  const poolEntry = (updatedRequest.candidatePool || []).find(
    (item) => (item.donor?._id || item.donor).toString() === donorId.toString()
  );
  if (poolEntry && typeof poolEntry.distanceKm === "number") {
    distanceKm = poolEntry.distanceKm;
  } else {
    const donorCoords = parseCoordinates(donorUser.location);
    const reqCoords = parseCoordinates(updatedRequest.location);
    if (donorCoords && reqCoords) {
      distanceKm = calculateHaversineDistanceKm(donorCoords[1], donorCoords[0], reqCoords[1], reqCoords[0]);
    }
  }

  const donor = await User.findById(donorId).select("fullName phoneNumber bloodGroup");

  // Notify receiver that an acceptance has arrived
  await Notification.create({
    recipientId: updatedRequest.requestedBy,
    type: "donor_accepted",
    relatedRequest: updatedRequest._id,
    message: `${donor?.fullName || "A donor"} has accepted your blood request${distanceKm > 0 ? ` (${distanceKm} km away)` : ""}! Selection window is collecting responses to find the nearest donor.`,
    priority: "high",
  });

  await logAuditEvent({
    requestId: updatedRequest._id,
    actor: donorId,
    actorRole: "donor",
    action: "DONOR_ACCEPTED",
    previousStatus: REQUEST_STATUSES.WAITING_FOR_DONOR,
    newStatus: REQUEST_STATUSES.WAITING_FOR_DONOR,
    metadata: {
      donorId,
      acceptedAt: now,
      distanceKm,
      totalAccepted: updatedRequest.acceptedDonors.length,
      selectionDeadline: updatedRequest.donorSelectionDeadline,
    },
    note: `Donor ${donor?.fullName || donorId} accepted (${distanceKm} km). Added to acceptance pool.`,
  });

  // ── Early selection check: if all candidatePool members have responded (accepted or declined) ──
  const totalPoolCandidates = (updatedRequest.candidatePool || []).length;
  const totalResponses = (updatedRequest.acceptedDonors || []).length + (updatedRequest.rejectedDonors || []).length;

  if (totalPoolCandidates > 0 && totalResponses >= totalPoolCandidates) {
    // All candidates have responded; trigger selection immediately without waiting
    await selectNearestAcceptedDonor(updatedRequest._id);
  } else {
    // Schedule in-process fallback timer to run selection as soon as donorSelectionDeadline expires
    const delayMs = updatedRequest.donorSelectionDeadline.getTime() - Date.now();
    if (delayMs > 0 && delayMs <= 10 * 60 * 1000) {
      setTimeout(() => {
        selectNearestAcceptedDonor(updatedRequest._id).catch((err) => {
          console.error(`[SelectionTimer] Error executing selection for request ${updatedRequest._id}:`, err.message);
        });
      }, delayMs);
    }
  }

  // Reload request to return current state (might have transitioned to matched if early selection triggered)
  const currentReq = await BloodRequest.findById(requestId);

  return res.status(200).json({
    success: true,
    message: currentReq.status === REQUEST_STATUSES.MATCHED
      ? "Request accepted successfully. Selection completed and nearest donor matched."
      : "Request accepted successfully. Selection window is open for nearby donors.",
    data: {
      requestId: currentReq._id,
      status: currentReq.status,
      donorSelectionDeadline: currentReq.donorSelectionDeadline,
      totalAcceptances: (currentReq.acceptedDonors || []).length,
      matchedDonor: currentReq.confirmedDonor,
    },
  });
});

/**
 * Donor declines the blood request.
 *
 * Part A-5 redesign: declining no longer triggers escalation to a next-in-queue donor.
 * The request stays open (waiting_for_donor) for all remaining candidates. The declining
 * donor is added to rejectedDonors and removed from candidatePool so they stop seeing
 * the request in their dashboard.
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

  if (request.status !== REQUEST_STATUSES.WAITING_FOR_DONOR) {
    return res.status(400).json({
      success: false,
      message: `Cannot decline a request in status '${request.status}'`,
    });
  }

  const inPool = request.candidatePool.some(
    (item) => (item.donor?._id || item.donor).toString() === donorId.toString()
  );
  if (!inPool) {
    return res.status(403).json({
      success: false,
      message: "You are not a candidate for this request.",
    });
  }

  // Add to rejectedDonors
  request.rejectedDonors.push({
    donor: donorId,
    reason: rejectionReason || "Donor declined request",
    rejectedAt: new Date(),
  });

  // Remove from candidatePool so they no longer see this request in viewRequests
  request.candidatePool = request.candidatePool.filter(
    (item) => (item.donor?._id || item.donor).toString() !== donorId.toString()
  );

  await request.save();

  // If candidatePool has no more pending candidates and we have acceptances, finalize selection immediately
  if (request.status === REQUEST_STATUSES.WAITING_FOR_DONOR && request.acceptedDonors && request.acceptedDonors.length > 0) {
    if (request.candidatePool.length === 0) {
      await selectNearestAcceptedDonor(request._id);
    }
  }

  const donor = await User.findById(donorId).select("fullName");

  await logAuditEvent({
    requestId: request._id,
    actor: donorId,
    actorRole: "donor",
    action: "DONOR_DECLINED",
    previousStatus: request.status,
    newStatus: request.status,
    metadata: { donorId, rejectionReason },
    note: `Donor ${donor?.fullName || donorId} declined. Removed from candidatePool. Request stays open for other candidates. Reason: ${rejectionReason || "None provided"}`,
  });

  return res.status(200).json({
    success: true,
    message: "Request declined. Other eligible donors can still accept.",
    data: {
      requestId: request._id,
      status: request.status,
    },
  });
});

/**
 * Get blood requests where this donor is the confirmed (matched) donor or has been accepted.
 * Part A-9: removed selectedDonor query, now uses acceptedDonors.donor.
 */
exports.getDonorAcceptances = asyncHandler(async (req, res) => {
  const donorId = req.user.id;

  const requests = await BloodRequest.find({
    "acceptedDonors.donor": new mongoose.Types.ObjectId(donorId),
    status: {
      $in: [
        REQUEST_STATUSES.MATCHED,
        REQUEST_STATUSES.BLOOD_TESTING,
        REQUEST_STATUSES.ADMIN_VERIFIED,
        REQUEST_STATUSES.BLOOD_TEST_SCHEDULED,
        REQUEST_STATUSES.FINAL_COMPLETED,
      ],
    },
  })
    .populate("requestedBy", "fullName phoneNumber location bloodGroup")
    .populate("assignedHospital", "hospitalName hospitalPhone")
    .populate("confirmedDonor", "fullName bloodGroup")
    .sort({ createdAt: -1 });

  return res.status(200).json({
    success: true,
    totalRequests: requests.length,
    data: requests,
  });
});