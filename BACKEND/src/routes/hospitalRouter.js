const express = require("express");
const hospitalVerificationController = require("../controllers/hospitalVerificationController");
const hospitalVerifyBlood = require("../controllers/hospitalVerifyRequestController");

const authMiddleware = require("../middlewares/authMiddleware");
const adminOnly = require("../middlewares/adminOnlyMiddleware");
const hospitalOnly = require("../middlewares/hospitalOnlyMiddleware");

const hospitalRouter = express.Router();

// Hospital registration request (hospital user)
hospitalRouter.post("/hospital/request-verification",authMiddleware,hospitalVerificationController.requestHospitalVerification);

// Admin verification routes
hospitalRouter.get("/admin/hospital-verification-requests",authMiddleware,adminOnly,hospitalVerificationController.getHospitalVerificationRequests);

hospitalRouter.post("/admin/verify-hospital",authMiddleware,adminOnly,hospitalVerificationController.verifyHospital);

// Public route to get verified hospitals
hospitalRouter.get("/hospitals/all",hospitalVerificationController.getAllHospitals);

// Public route to get specific hospital details
hospitalRouter.get("/hospitals/:hospitalId",hospitalVerificationController.getHospitalDetails);


// Hospital approves blood request
hospitalRouter.post(
  "/hospital/approve-request/:requestId",
  authMiddleware,
  hospitalOnly,
  hospitalVerifyBlood.approveBloodRequest
);

// Hospital rejects blood request
hospitalRouter.post(
  "/hospital/reject-request/:requestId",
  authMiddleware,
  hospitalOnly,
  hospitalVerifyBlood.rejectBloodRequest
);


module.exports = hospitalRouter;

