const assert = require("assert");
const {
  REQUEST_STATUSES,
  canTransition,
  validateTransition,
} = require("../src/utils/stateMachine");

console.log("▶ Running State Machine Tests...");

// Valid transitions
assert.strictEqual(
  canTransition(REQUEST_STATUSES.PENDING_HOSPITAL_APPROVAL, REQUEST_STATUSES.HOSPITAL_APPROVED),
  true
);
assert.strictEqual(
  canTransition(REQUEST_STATUSES.PENDING_HOSPITAL_APPROVAL, REQUEST_STATUSES.REJECTED),
  true
);
assert.strictEqual(
  canTransition(REQUEST_STATUSES.HOSPITAL_APPROVED, REQUEST_STATUSES.WAITING_FOR_DONOR),
  true
);
assert.strictEqual(
  canTransition(REQUEST_STATUSES.HOSPITAL_APPROVED, REQUEST_STATUSES.NO_DONORS_AVAILABLE),
  true
);
assert.strictEqual(
  canTransition(REQUEST_STATUSES.WAITING_FOR_DONOR, REQUEST_STATUSES.MATCHED),
  true
);
assert.strictEqual(
  canTransition(REQUEST_STATUSES.WAITING_FOR_DONOR, REQUEST_STATUSES.NO_DONORS_AVAILABLE),
  true
);
assert.strictEqual(
  canTransition(REQUEST_STATUSES.MATCHED, REQUEST_STATUSES.BLOOD_TEST_SCHEDULED),
  true
);
assert.strictEqual(
  canTransition(REQUEST_STATUSES.BLOOD_TEST_SCHEDULED, REQUEST_STATUSES.FINAL_COMPLETED),
  true
);
assert.strictEqual(
  canTransition(REQUEST_STATUSES.BLOOD_TEST_SCHEDULED, REQUEST_STATUSES.BLOOD_TEST_SCHEDULED),
  true,
  "Must allow blood_test_scheduled self-transition when next backup donor is tested"
);
assert.strictEqual(
  canTransition(REQUEST_STATUSES.BLOOD_TEST_SCHEDULED, REQUEST_STATUSES.WAITING_FOR_DONOR),
  true,
  "Must allow transition back to waiting_for_donor when all backups exhaust and rebroadcast begins"
);

// Invalid transitions
assert.strictEqual(
  canTransition(REQUEST_STATUSES.PENDING_HOSPITAL_APPROVAL, REQUEST_STATUSES.MATCHED),
  false,
  "Cannot jump from pending approval straight to matched"
);
assert.strictEqual(
  canTransition(REQUEST_STATUSES.FINAL_COMPLETED, REQUEST_STATUSES.WAITING_FOR_DONOR),
  false,
  "Completed requests cannot re-enter waiting_for_donor"
);
assert.strictEqual(
  canTransition(REQUEST_STATUSES.REJECTED, REQUEST_STATUSES.HOSPITAL_APPROVED),
  false,
  "Rejected requests cannot transition to hospital approved"
);

// validateTransition throws for invalid transitions
assert.throws(() => {
  validateTransition(REQUEST_STATUSES.PENDING_HOSPITAL_APPROVAL, REQUEST_STATUSES.FINAL_COMPLETED);
}, /Invalid state transition/);

console.log("✅ All State Machine Tests Passed!");
