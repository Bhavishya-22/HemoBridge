const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const userSchema = new mongoose.Schema(

  {
    // ─── Core Fields ───────────────────────────────────────────
    fullName: {
      type: String,
      required: true,
      trim: true,
    },

    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },

    phoneNumber: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
    },

    password: {
      type: String,
      required: true,
      select: false, // never returned in queries by default
    },

    role: {
      type: String,
      enum: ["donor", "receiver", "hospital", "admin"],
      default: "donor",
    },

    // ─── Donor / Receiver Fields ───────────────────────────────
    bloodGroup: {
      type: String,
      enum: ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"],
      uppercase: true,
    },

    availabilityStatus: {
      type: String,
      enum: ["available", "busy", "inactive"],
      default: "available",
    },

    lastDonationDate: {
      type: Date,
      default: null,
    },

    age: {
      type: Number,
      min: 18,
      max: 65,
    },

    weight: {
      type: Number,
      min: 45, // WHO minimum for donation
    },

    diseases: {
      type: [String],
      default: [],
    },

    // ─── Location (GeoJSON for $near queries) ──────────────────
    location: {
      city: { type: String, trim: true },
      state: { type: String, trim: true },
      // GeoJSON Point — required for proximity-based donor search
      coordinates: {
        type: {
          type: String,
          enum: ["Point"],
          default: "Point",
        },
        coordinates: {
          type: [Number], // [longitude, latitude] — MongoDB order
          default: undefined,
        },
      },
    },

    // ─── Hospital-Specific Fields ──────────────────────────────
    hospitalName: {
      type: String,
      trim: true,
    },

    registrationNumber: {
      type: String,
      trim: true,
      sparse: true,
      unique: true,
    },

    hospitalAddress: {
      type: String,
      trim: true,
    },

    hospitalPhone: {
      type: String,
      trim: true,
    },

    hospitalVerified: {
      type: Boolean,
      default: false,
    },

    hospitalVerificationStatus: {
      type: String,
      enum: ["pending", "verified", "rejected"],
      default: "pending",
    },

    hospitalVerificationNotes: {
      type: String,
      trim: true,
    },

    hospitalVerifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    hospitalVerifiedAt: {
      type: Date,
      default: null,
    },

    // ─── Account Status ────────────────────────────────────────
    profileCompleted: {
      type: Boolean,
      default: false,
    },

    isVerified: {
      type: Boolean,
      default: false,
    },

    isBlocked: {
      type: Boolean,
      default: false,
    },

    refreshToken: {
      type: String,
      select: false, // never exposed in queries
    },
  },
  {
    timestamps: true,
  }
);

// ─── Indexes ─────────────────────────────────────────────────────
// 2dsphere index is REQUIRED for $near / $geoWithin proximity queries
userSchema.index({ "location.coordinates": "2dsphere" });
userSchema.index({ role: 1 });
userSchema.index({ bloodGroup: 1, availabilityStatus: 1 }); // compound — donor search
userSchema.index({ hospitalVerificationStatus: 1 }); 
// Password Hashing
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();

  this.password = await bcrypt.hash(this.password, 10);
  next();
});

// Compare Password
userSchema.methods.comparePassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Generate Access Token
userSchema.methods.generateAccessToken = function () {
  return jwt.sign(
    {
      id: this._id,
      email: this.email,
      username: this.username,
      fullName: this.fullName,
      role: this.role,
      hospitalVerified: this.hospitalVerified,
    },
    process.env.JWT_ACCESS_SECRET,
    {
      expiresIn: "15m",
    }
  );
};

// Generate Refresh Token
userSchema.methods.generateRefreshToken = function () {
  return jwt.sign(
    {
      id: this._id,
    },
    process.env.JWT_REFRESH_SECRET,
    {
      expiresIn: "1d",
    }
  );
};     

module.exports = mongoose.model("User", userSchema);