const AuditLog = require("../model/auditLogModel");

/**
 * Record an audit log entry for any privileged or state-changing action.
 * @param {Object} params
 * @param {string|mongoose.Types.ObjectId} params.requestId - Blood request ID
 * @param {string|mongoose.Types.ObjectId|null} [params.actor=null] - User ID who triggered action, null for system
 * @param {string} [params.actorRole="system"] - receiver | hospital | donor | admin | system
 * @param {string} params.action - Action identifier
 * @param {string} [params.previousStatus=null] - Previous request status
 * @param {string} [params.newStatus=null] - New request status
 * @param {Object} [params.metadata={}] - Key-value metadata context
 * @param {string} [params.note=""] - Human-readable explanation
 * @returns {Promise<AuditLog|null>}
 */
async function logAuditEvent({
  requestId,
  actor = null,
  actorRole = "system",
  action,
  previousStatus = null,
  newStatus = null,
  metadata = {},
  note = "",
}) {
  try {
    if (!requestId || !action) {
      console.warn("logAuditEvent skipped: missing requestId or action");
      return null;
    }

    const log = await AuditLog.create({
      requestId,
      actor,
      actorRole,
      action,
      previousStatus,
      newStatus,
      metadata,
      note,
    });
    return log;
  } catch (err) {
    // Non-blocking log failure to prevent breaking user transaction
    console.error("Failed to write audit log:", err.message);
    return null;
  }
}

module.exports = {
  logAuditEvent,
};
