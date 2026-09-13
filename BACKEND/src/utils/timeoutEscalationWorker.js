const BloodRequest = require("../model/bloodRequestModel");
const { REQUEST_STATUSES } = require("./stateMachine");
const { escalateToNextDonor } = require("./donorSelectionService");

let workerInterval = null;
const SWEEP_INTERVAL_MS = 60 * 1000; // Run sweep every 60 seconds

/**
 * Perform a single sweep to find and escalate expired requests.
 */
async function runTimeoutEscalationSweep() {
  try {
    const now = new Date();

    // Query active requests waiting for a donor whose deadline has passed
    const expiredRequests = await BloodRequest.find({
      status: REQUEST_STATUSES.WAITING_FOR_DONOR,
      donorResponseDeadline: { $lte: now },
    }).select("_id selectedDonor donorResponseDeadline emergencyLevel");

    if (expiredRequests.length > 0) {
      console.log(`[TimeoutWorker] Found ${expiredRequests.length} expired blood requests. Escalating...`);
    }

    for (const req of expiredRequests) {
      try {
        await escalateToNextDonor(req._id, {
          reason: "timeout",
          actorId: null,
          actorRole: "system",
          note: `Automated escalation: donor response deadline ${req.donorResponseDeadline} passed`,
        });
      } catch (err) {
        console.error(`[TimeoutWorker] Error escalating request ${req._id}:`, err.message);
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
