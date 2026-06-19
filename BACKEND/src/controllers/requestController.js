const BloodRequest = require("../model/bloodRequestModel");

exports.createRequest = async (req, res) => {
  try {
    const {
      bloodGroup,
      quantity,
      emergencyLevel,
    } = req.body;

    const request = await BloodRequest.create({
      requestedBy: req.user.id,
      bloodGroup,
      quantity,
      emergencyLevel,
    });

    res.status(201).json({
      success: true,
      message: "Blood request created successfully",
      request,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.viewRequests = async (req, res) => {
  try {
    const requests = await BloodRequest.find({
      status: "pending",
    })
      .populate(
        "requestedBy",
        "fullName bloodGroup location"
      )
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      totalRequests: requests.length,
      requests,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.myRequests = async (req, res) => {
  try {
    const requests = await BloodRequest.find({
      requestedBy: req.user.id,
    })
      .populate(
        "acceptedBy",
        "fullName email phoneNumber bloodGroup"
      )
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      totalRequests: requests.length,
      requests,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};