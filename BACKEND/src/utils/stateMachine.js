/**
 * Centralized State Machine for Blood Request Lifecycles
 *
 * DONOR_ACCEPTED has been removed (Part C-4). It was a legacy alias for MATCHED
 * with identical downstream transitions. MATCHED is now the single canonical status
 * that follows a donor accepting a request.
 */

const REQUEST_STATUSES = Object.freeze({
  PENDING_HOSPITAL_APPROVAL: "pending_hospital_approval",
  HOSPITAL_APPROVED: "hospital_approved",
  WAITING_FOR_DONOR: "waiting_for_donor",
  MATCHED: "matched",
  NO_DONORS_AVAILABLE: "no_donors_available",
  BLOOD_TESTING: "blood_testing",
  ADMIN_VERIFIED: "admin_verified",
  BLOOD_TEST_SCHEDULED: "blood_test_scheduled",
  FINAL_COMPLETED: "final_completed",
  REJECTED: "rejected",
  CANCELLED: "cancelled",
});

/**
 * Explicit map of allowed status transitions.
 * Key: Current Status
 * Value: Array of valid Next Statuses
 */
const ALLOWED_TRANSITIONS = Object.freeze({
  [REQUEST_STATUSES.PENDING_HOSPITAL_APPROVAL]: [
    REQUEST_STATUSES.HOSPITAL_APPROVED,
    REQUEST_STATUSES.REJECTED,
    REQUEST_STATUSES.CANCELLED,
  ],
  [REQUEST_STATUSES.HOSPITAL_APPROVED]: [
    REQUEST_STATUSES.WAITING_FOR_DONOR,
    REQUEST_STATUSES.NO_DONORS_AVAILABLE,
    REQUEST_STATUSES.CANCELLED,
    REQUEST_STATUSES.REJECTED,
  ],
  [REQUEST_STATUSES.WAITING_FOR_DONOR]: [
    REQUEST_STATUSES.WAITING_FOR_DONOR, // self-transition: radius widening re-broadcasts without status change
    REQUEST_STATUSES.MATCHED,           // donor accepts (atomic)
    REQUEST_STATUSES.NO_DONORS_AVAILABLE,
    REQUEST_STATUSES.CANCELLED,
  ],
  [REQUEST_STATUSES.MATCHED]: [
    REQUEST_STATUSES.BLOOD_TESTING,
    REQUEST_STATUSES.ADMIN_VERIFIED,
    REQUEST_STATUSES.BLOOD_TEST_SCHEDULED,
    REQUEST_STATUSES.FINAL_COMPLETED,
    REQUEST_STATUSES.HOSPITAL_APPROVED,  // blood test fails, no fallback acceptors — re-broadcast
    REQUEST_STATUSES.WAITING_FOR_DONOR,  // confirmed donor cancels before test — re-open to candidates
    REQUEST_STATUSES.CANCELLED,
  ],
  [REQUEST_STATUSES.ADMIN_VERIFIED]: [
    REQUEST_STATUSES.BLOOD_TEST_SCHEDULED,
    REQUEST_STATUSES.CANCELLED,
  ],
  [REQUEST_STATUSES.BLOOD_TEST_SCHEDULED]: [
    REQUEST_STATUSES.FINAL_COMPLETED,
    REQUEST_STATUSES.BLOOD_TEST_SCHEDULED, // blood test fails, backup promoted to test next
    REQUEST_STATUSES.MATCHED,             // blood test fails, fallback to another acceptor
    REQUEST_STATUSES.WAITING_FOR_DONOR,   // all acceptors exhausted — re-broadcast to new candidates
    REQUEST_STATUSES.HOSPITAL_APPROVED,   // all acceptors exhausted — hospital fallback
    REQUEST_STATUSES.CANCELLED,
  ],
  [REQUEST_STATUSES.NO_DONORS_AVAILABLE]: [
    REQUEST_STATUSES.WAITING_FOR_DONOR, // admin manually triggers re-broadcast / new donors registered
    REQUEST_STATUSES.CANCELLED,
  ],
  [REQUEST_STATUSES.FINAL_COMPLETED]: [],
  [REQUEST_STATUSES.REJECTED]: [],
  [REQUEST_STATUSES.CANCELLED]: [],
});

/**
 * Check if transition from currentStatus to nextStatus is permitted.
 * @param {string} currentStatus
 * @param {string} nextStatus
 * @returns {boolean}
 */
function canTransition(currentStatus, nextStatus) {
  if (!currentStatus || !nextStatus) return false;
  const allowed = ALLOWED_TRANSITIONS[currentStatus];
  if (!allowed) return false;
  return allowed.includes(nextStatus);
}

/**
 * Validate status transition and throw error if invalid.
 * @param {string} currentStatus
 * @param {string} nextStatus
 * @throws {Error} If transition is not allowed
 */
function validateTransition(currentStatus, nextStatus) {
  if (!canTransition(currentStatus, nextStatus)) {
    const allowed = ALLOWED_TRANSITIONS[currentStatus] || [];
    const error = new Error(
      `Invalid state transition from '${currentStatus}' to '${nextStatus}'. Allowed transitions: [${allowed.join(", ")}]`
    );
    error.statusCode = 400;
    error.name = "InvalidStateTransitionError";
    throw error;
  }
}

module.exports = {
  REQUEST_STATUSES,
  ALLOWED_TRANSITIONS,
  canTransition,
  validateTransition,
};
