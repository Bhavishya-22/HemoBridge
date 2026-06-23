const express = require("express");
const hospitalVerificationController = require("../controllers/hospitalVerificationController");
const authMiddleware = require("../middlewares/authMiddleware");
const adminOnly = require("../middlewares/adminOnlyMiddleware");

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

module.exports = hospitalRouter;