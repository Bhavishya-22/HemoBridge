/**
 * Blood group compatibility utility for red blood cell donations.
 */

// Given receiver blood group -> which donor blood groups are compatible
const RECEIVER_TO_DONOR_COMPATIBILITY = {
  "O+": ["O+", "O-"],
  "O-": ["O-"],
  "A+": ["A+", "A-", "O+", "O-"],
  "A-": ["A-", "O-"],
  "B+": ["B+", "B-", "O+", "O-"],
  "B-": ["B-", "O-"],
  "AB+": ["O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"], // universal recipient
  "AB-": ["O-", "A-", "B-", "AB-"],
};

// Given donor blood group -> which receiver blood groups can accept this donation
const DONOR_TO_RECEIVER_COMPATIBILITY = {
  "O-": ["O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"], // universal donor
  "O+": ["O+", "A+", "B+", "AB+"],
  "A-": ["A+", "A-", "AB+", "AB-"],
  "A+": ["A+", "AB+"],
  "B-": ["B+", "B-", "AB+", "AB-"],
  "B+": ["B+", "AB+"],
  "AB-": ["AB+", "AB-"],
  "AB+": ["AB+"],
};

/**
 * Get all donor blood groups that can donate to a receiver with the given blood group.
 * @param {string} receiverBloodGroup 
 * @returns {string[]} List of compatible donor blood groups
 */
function getCompatibleBloodGroups(receiverBloodGroup) {
  if (!receiverBloodGroup) return [];
  const normalized = receiverBloodGroup.trim().toUpperCase();
  return RECEIVER_TO_DONOR_COMPATIBILITY[normalized] || [normalized];
}

/**
 * Get all receiver blood groups that a donor with the given blood group can donate to.
 * @param {string} donorBloodGroup 
 * @returns {string[]} List of recipient blood groups
 */
function getRecipientsForDonor(donorBloodGroup) {
  if (!donorBloodGroup) return [];
  const normalized = donorBloodGroup.trim().toUpperCase();
  return DONOR_TO_RECEIVER_COMPATIBILITY[normalized] || [normalized];
}

/**
 * Check if a donor blood group is compatible with a receiver blood group.
 * @param {string} donorBloodGroup 
 * @param {string} receiverBloodGroup 
 * @returns {boolean}
 */
function isBloodCompatible(donorBloodGroup, receiverBloodGroup) {
  const compatibleDonors = getCompatibleBloodGroups(receiverBloodGroup);
  return compatibleDonors.includes(donorBloodGroup?.trim()?.toUpperCase());
}

module.exports = {
  RECEIVER_TO_DONOR_COMPATIBILITY,
  DONOR_TO_RECEIVER_COMPATIBILITY,
  getCompatibleBloodGroups,
  getRecipientsForDonor,
  isBloodCompatible,
};
