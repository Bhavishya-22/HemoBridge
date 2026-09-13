const assert = require("assert");
const {
  getCompatibleBloodGroups,
  getRecipientsForDonor,
  isBloodCompatible,
} = require("../src/utils/bloodCompatibility");

console.log("▶ Running Blood Compatibility Tests...");

// Test 1: O- receiver can ONLY receive from O-
assert.deepStrictEqual(getCompatibleBloodGroups("O-"), ["O-"]);

// Test 2: O+ receiver can receive from O+ and O-
assert.deepStrictEqual(getCompatibleBloodGroups("O+"), ["O+", "O-"]);

// Test 3: A+ receiver can receive from A+, A-, O+, O-
assert.deepStrictEqual(getCompatibleBloodGroups("A+"), ["A+", "A-", "O+", "O-"]);

// Test 4: AB+ is universal recipient and can receive from all 8 groups
assert.deepStrictEqual(getCompatibleBloodGroups("AB+"), [
  "O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"
]);

// Test 5: O- is universal donor and can donate to all 8 groups
assert.deepStrictEqual(getRecipientsForDonor("O-"), [
  "O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"
]);

// Test 6: AB+ can only donate to AB+
assert.deepStrictEqual(getRecipientsForDonor("AB+"), ["AB+"]);

// Test 7: isBloodCompatible checks
assert.strictEqual(isBloodCompatible("O-", "AB+"), true);
assert.strictEqual(isBloodCompatible("O+", "O-"), false);
assert.strictEqual(isBloodCompatible("A+", "O+"), false);
assert.strictEqual(isBloodCompatible("O+", "A+"), true);

console.log("✅ All Blood Compatibility Tests Passed!");
