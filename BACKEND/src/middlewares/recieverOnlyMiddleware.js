//receiverOnlyMiddleware.js
const User = require("../model/userModel");

const receiverOnly = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);

    if (user.role !== "receiver") {
      return res.status(403).json({
        success: false,
        message: "Only receivers can access this route",
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

module.exports = receiverOnly;