// statsController.js — public stats for the home page
const asyncHandler = require('express-async-handler');
const User = require('../model/userModel');
const BloodRequest = require('../model/bloodRequestModel');

// In-memory cache — avoids hitting MongoDB on every page load
let _statsCache = null;
let _statsCacheAt = 0;
const CACHE_TTL_MS = 60_000; // 60 seconds

/**
 * GET /stats
 * Public endpoint — no auth required.
 * Returns:
 *   totalDonors       : number of registered donors
 *   livesSupported    : number of completed/final blood requests
 *   bloodGroupCounts  : array of { type, donors } per blood group
 */
exports.getPublicStats = asyncHandler(async (req, res) => {
  // Serve from cache if still fresh
  if (_statsCache && Date.now() - _statsCacheAt < CACHE_TTL_MS) {
    res.set('Cache-Control', 'public, max-age=60');
    return res.status(200).json(_statsCache);
  }

  const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

  const [totalDonors, livesSupported, bloodGroupAgg] = await Promise.all([
    // Count all registered donors (active, not blocked, profile completed)
    User.countDocuments({ role: 'donor', isBlocked: false, profileCompleted: true }),

    // Count requests that reached a completed state (lives genuinely helped)
    BloodRequest.countDocuments({
      status: { $in: ['final_completed', 'blood_test_scheduled', 'admin_verified'] },
    }),

    // Aggregate donors by blood group (only onboarded donors with bloodGroup set)
    User.aggregate([
      { $match: { role: 'donor', isBlocked: false, profileCompleted: true, bloodGroup: { $in: BLOOD_GROUPS } } },
      { $group: { _id: '$bloodGroup', count: { $sum: 1 } } },
    ]),
  ]);

  // Build a complete list for all 8 blood groups (0 if none registered)
  const countMap = {};
  bloodGroupAgg.forEach((row) => {
    countMap[row._id] = row.count;
  });

  const bloodGroupCounts = BLOOD_GROUPS.map((type) => ({
    type,
    donors: countMap[type] || 0,
  }));

  const payload = {
    success: true,
    totalDonors,
    livesSupported,
    bloodGroupCounts,
    bloodTypesCovered: 8,
  };

  // Cache for next request
  _statsCache = payload;
  _statsCacheAt = Date.now();

  res.set('Cache-Control', 'public, max-age=60');
  res.status(200).json(payload);
});
