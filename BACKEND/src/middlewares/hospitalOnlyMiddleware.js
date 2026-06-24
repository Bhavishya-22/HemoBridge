//hospitalOnlyMiddleware.js
const User = require("../model/userModel");

const hospitalOnly = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);

    if (user.role !== "hospital") {
      return res.status(403).json({
        success: false,
        message: "Only hospitals can access this route",
      });
    }

    // Check if hospital is verified
    if (user.hospitalVerificationStatus !== "verified") {
      return res.status(403).json({
        success: false,
        message: "Hospital not verified. Contact admin for verification.",
      });
    }

    next();
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

module.exports = hospitalOnly;