//donorOnlyMiddleware
const User = require("../model/userModel");

const donorOnly = async (req,res,next) => {
  try {
    const user = await User.findById(req.user.id);

    if (user.role !== "donor") {
      return res.status(403).json({
        success: false,
        message:
          "Only donors can access this route",
      });
    }
    next();
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      success: false,
      message: "okayy" + error.message,
    });
  }
};

module.exports = donorOnly;