const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const userSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: true,
    },

    username: {
      type: String,
      required: true,
      unique: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
    },

    phoneNumber: {
      type: String,
      unique: true,
      sparse: true,
    },

    password: {
      type: String,
      required: true,
    },

    role: {
      type: String,
      enum: ["donor", "receiver", "hospital", "admin"],
      default: "donor",
    },

    bloodGroup: String,
    age: Number,
    weight: Number,
    diseases: [String],

    location: {
      city: String,
      state: String,
      coordinates: {
        lat: Number,
        lng: Number,
      },
    },

    profileCompleted: {
      type: Boolean,
      default: false,
    },

    refreshToken: String,
  },
  {
    timestamps: true,
  }
);

// 🔑 Pre-save hook: hash password automatically
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return;
  this.password = await bcrypt.hash(this.password, 10);
});

// 🔑 Compare entered password with hashed password
userSchema.methods.comparePassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// 🔑 Generate Access Token
userSchema.methods.generateAccessToken = function () {
  return jwt.sign(
    {
      id: this._id,
      email: this.email,
      username: this.username,
      fullName: this.fullName,
    },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: "15m" } // short-lived
  );
};

// 🔑 Generate Refresh Token
userSchema.methods.generateRefreshToken = function () {
  return jwt.sign(
    { id: this._id },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: "1d" } // long-lived
  );
};

module.exports = mongoose.model("User", userSchema);
