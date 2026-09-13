const BloodRequest = require("../model/bloodRequestModel");
const { REQUEST_STATUSES } = require("./stateMachine");
const { widenSearchRadius, selectNearestAcceptedDonor } = require("./donorSelectionService");

let workerInterval = null;
const SWEEP_INTERVAL_MS = 60 * 1000; // Run sweep every 60 seconds

/**
 * Perform sweeps for:
 *  1. Expired donor selection windows (requests in WAITING_FOR_DONOR with acceptances)
 *  2. Expired broadcast acceptance deadlines (requests in WAITING_FOR_DONOR with 0 acceptances)
 */
async function runTimeoutEscalationSweep() {
  try {
    const now = new Date();

    // ── Sweep 1: Finalize nearest donor selection for expired collection windows ──
    const selectionExpiredRequests = await BloodRequest.find({
      status: REQUEST_STATUSES.WAITING_FOR_DONOR,
      donorSelectionDeadline: { $lte: now },
      "acceptedDonors.0": { $exists: true },
    }).select("_id donorSelectionDeadline emergencyLevel acceptedDonors");

    if (selectionExpiredRequests.length > 0) {
      console.log(`[TimeoutWorker] Found ${selectionExpiredRequests.length} requests with expired selection window. Selecting nearest donor...`);
    }

    for (const req of selectionExpiredRequests) {
      try {
        await selectNearestAcceptedDonor(req._id);
      } catch (err) {
        console.error(`[TimeoutWorker] Error selecting nearest donor for request ${req._id}:`, err.message);
      }
    }

    // ── Sweep 2: Radius widening for expired broadcast deadlines with zero acceptances ──
    const radiusExpiredRequests = await BloodRequest.find({
      status: REQUEST_STATUSES.WAITING_FOR_DONOR,
      acceptanceDeadline: { $lte: now },
      $or: [
        { acceptedDonors: { $size: 0 } },
        { acceptedDonors: { $exists: false } },
        { acceptedDonors: null },
      ],
    }).select("_id acceptanceDeadline emergencyLevel");

    if (radiusExpiredRequests.length > 0) {
      console.log(`[TimeoutWorker] Found ${radiusExpiredRequests.length} expired blood requests without acceptances. Widening search radius...`);
    }

    for (const req of radiusExpiredRequests) {
      try {
        await widenSearchRadius(req._id, {
          actorId: null,
          actorRole: "system",
          note: `Automated radius widening: acceptance deadline ${req.acceptanceDeadline} passed`,
        });
      } catch (err) {
        console.error(`[TimeoutWorker] Error widening radius for request ${req._id}:`, err.message);
      }
    }
  } catch (error) {
    console.error("[TimeoutWorker] Sweep error:", error.message);
  }
}

/**
 * Start the background timeout escalation worker.
 * @param {number} [intervalMs=60000]
 */
function startTimeoutWorker(intervalMs = SWEEP_INTERVAL_MS) {
  if (workerInterval) {
    clearInterval(workerInterval);
  }

  // Run immediate first sweep after a short initial delay (e.g. 5 seconds)
  setTimeout(runTimeoutEscalationSweep, 5000);

  workerInterval = setInterval(runTimeoutEscalationSweep, intervalMs);
  console.log(`⏱️ Timeout escalation worker started (sweeping every ${intervalMs / 1000}s)`);
}

/**
 * Stop the background worker cleanly.
 */
function stopTimeoutWorker() {
  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
    console.log("🛑 Timeout escalation worker stopped");
  }
}

module.exports = {
  startTimeoutWorker,
  stopTimeoutWorker,
  runTimeoutEscalationSweep,
};
