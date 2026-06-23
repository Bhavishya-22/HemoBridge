//donorOnlyMiddleware
const User = require("../model/userModel");

const donorOnly = async (req,res,next) => {
  try {
    const user = await User.findById(req.user.id);

    if (user.role !== "donor" &&user.role !== "hospital") {
      return res.status(403).json({
        success: false,
        message:
          "Only donors can accept requests",
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

module.exports = donorOnly;