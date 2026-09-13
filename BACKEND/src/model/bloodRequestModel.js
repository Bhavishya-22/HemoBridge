const mongoose = require("mongoose");

/**
 * BloodRequest Schema — opt-in broadcast model (Part A redesign)
 *
 * Removed fields vs. previous version:
 *  - selectedDonor        → renamed to confirmedDonor (set only after atomic accept wins)
 *  - donorQueue[]         → removed; sequential queue replaced by candidatePool[]
 *  - currentDonorIndex    → removed; no queue cursor needed
 *  - donorResponseDeadline → renamed to acceptanceDeadline (window for ANY candidate to accept)
 *  - allDonorsRejected    → removed; derivable from status === "no_donors_available"
 *  - donorAcceptanceStatus (nested) → removed; exact duplicate of acceptedDonors[]
 *  - backupDonorsOnHold[] → removed; replaced by querying acceptedDonors minus rejectedDonors
 *  - notifiedDonors[]     → removed; replaced by candidatePool[] which carries distance context
 *  - "donor_accepted" from status enum → collapsed into "matched" (Part C-4)
 *
 * Added fields:
 *  - confirmedDonor        : ObjectId — winner of atomic accept
 *  - confirmedDonorDistanceKm : Number — distance of winning donor (audit transparency)
 *  - candidatePool[]       : eligible donors at broadcast time, with distance + radius context
 *  - acceptanceDeadline    : Date — when open acceptance window closes
 *  - radiusWideningApplied : Boolean — prevents double-widening on timeout
 */
const bloodRequestSchema = new mongoose.Schema(
  {
    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    bloodGroup: {
      type: String,
      enum: ["O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"],
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
      max: 10,
    },
    emergencyLevel: {
      type: String,
      enum: ["low", "medium", "high", "critical"],
      default: "medium",
    },
    status: {
      type: String,
      enum: [
        "pending_hospital_approval",
        "hospital_approved",
        "waiting_for_donor",
        "matched",                // canonical post-acceptance status (DONOR_ACCEPTED removed)
        "no_donors_available",
        "blood_testing",
        "admin_verified",
        "blood_test_scheduled",
        "final_completed",
        "rejected",
        "cancelled",
      ],
      default: "pending_hospital_approval",
    },

    // ─── Confirmed donor (set atomically on first valid acceptance) ─────────
    confirmedDonor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    // Distance of the winning donor from request location — stored for audit/admin transparency.
    // PRODUCT DECISION: first-come-first-served acceptance (no grace window). Distance is recorded
    // here so hospitals/admins can see if the match was local. Use admin re-selection override
    // (adminVerificationController.selectDonorForVerification) if distance is unreasonably large.
    confirmedDonorDistanceKm: {
      type: Number,
      default: null,
    },
    nearestDonor: {
      donor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      distanceKm: Number,
    },

    // ─── Candidate pool (broadcast recipients) ───────────────────────────────
    // Populated when hospital approves. All eligible donors within broadcast radius.
    // Append-only: radius widening adds more entries with a larger searchRadiusKm.
    candidatePool: [
      {
        donor: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        distanceKm: Number,
        searchRadiusKm: Number,       // which sweep this donor was found in
        addedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    // ─── Acceptance window ───────────────────────────────────────────────────
    acceptanceDeadline: Date,         // when the open-to-all window closes (radius widening timeout)
    donorSelectionDeadline: {         // short window for collecting multiple acceptances before nearest donor selection
      type: Date,
      default: null,
    },
    radiusWideningApplied: {          // true after first timeout sweep widens search
      type: Boolean,
      default: false,
    },

    // ─── Hospital assignment ─────────────────────────────────────────────────
    assignedHospital: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    matchedAt: Date,
    location: {
      city: String,
      state: String,
      // Flat {lat, lng} format — stored as-received from frontend.
      // parseCoordinates() in donorSelectionService converts this for $geoNear queries.
      coordinates: {
        lat: Number,
        lng: Number,
      },
    },
    hospitalName: String,
    description: String,
    completedAt: Date,
    hospitalVerifiedAt: Date,
    hospitalApproved: {
      type: Boolean,
      default: false,
    },
    hospitalApprovedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    hospitalApprovedAt: Date,

    // ─── Admin verification ───────────────────────────────────────────────────
    adminVerified: {
      type: Boolean,
      default: false,
    },
    adminVerifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    adminVerifiedAt: Date,

    // ─── Blood test scheduling ────────────────────────────────────────────────
    bloodTestScheduled: {
      type: Boolean,
      default: false,
    },
    bloodTestScheduledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    bloodTestScheduledAt: Date,

    // ─── All donors who explicitly accepted (winner + others) ────────────────
    acceptedDonors: [
      {
        donor: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        acceptedAt: Date,
        status: {
          type: String,
          enum: ["accepted", "selected", "backup", "rejected"],
          default: "accepted",
        },
      },
    ],

    // ─── Donors who declined or failed blood test ────────────────────────────
    rejectedDonors: [
      {
        donor: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        reason: String,
        rejectedAt: Date,
      },
    ],

    // ─── Receiver blood test confirmation ────────────────────────────────────
    receiverBloodTestConfirmation: {
      confirmedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      status: {
        type: String,
        enum: ["success", "failed"],
        default: null,
      },
      message: String,
      confirmedAt: Date,
    },

    // ─── Completion tracking ──────────────────────────────────────────────────
    finalThankYouSent: {
      type: Boolean,
      default: false,
    },
    finalThankYouSentAt: Date,

    donorNotificationSent: {       // true once broadcast notifications have been sent
      type: Boolean,
      default: false,
    },
    lastDonorNotifiedAt: Date,

    bloodTestResult: {
      type: String,
      enum: ["pending", "accepted", "rejected"],
      default: "pending",
    },

    receiverConfirmed: {
      type: Boolean,
      default: false,
    },
    receiverConfirmedAt: Date,
  },
  {
    timestamps: true,
  }
);

// ─── Indexes ──────────────────────────────────────────────────────────────────
bloodRequestSchema.index({ status: 1, createdAt: -1 });
bloodRequestSchema.index({ requestedBy: 1 });
bloodRequestSchema.index({ bloodGroup: 1, status: 1 });
bloodRequestSchema.index({ assignedHospital: 1, status: 1 });
// Replaces the old donorResponseDeadline index — used by timeoutEscalationWorker sweep
bloodRequestSchema.index({ status: 1, acceptanceDeadline: 1 });
// Used by timeoutEscalationWorker sweep to finalize nearest donor selection when collection window expires
bloodRequestSchema.index({ status: 1, donorSelectionDeadline: 1 });
// Used by viewRequests to quickly find requests a specific donor is a candidate for
bloodRequestSchema.index({ "candidatePool.donor": 1 });
// 2dsphere on request location — required for geo-sorted viewRequests donor list
bloodRequestSchema.index({ "location.coordinates": "2dsphere" });

module.exports = mongoose.model("BloodRequest", bloodRequestSchema);