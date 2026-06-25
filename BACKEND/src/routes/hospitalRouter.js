const express = require("express");
const hospitalVerificationController = require("../controllers/hospitalVerificationController");
const hospitalVerifyBlood = require("../controllers/hospitalVerifyRequestController");
const adminDonorAllocationController = require("../controllers/adminDonorAllocationController");

const authMiddleware = require("../middlewares/authMiddleware");
const adminOnly = require("../middlewares/adminOnlyMiddleware");
const hospitalOnly = require("../middlewares/hospitalOnlyMiddleware");

const hospitalRouter = express.Router();

// Existing routes...
hospitalRouter.post("/hospital/request-verification", authMiddleware, hospitalVerificationController.requestHospitalVerification);
hospitalRouter.get("/admin/hospital-verification-requests", authMiddleware, adminOnly, hospitalVerificationController.getHospitalVerificationRequests);
hospitalRouter.post("/admin/verify-hospital", authMiddleware, adminOnly, hospitalVerificationController.verifyHospital);
hospitalRouter.get("/hospitals/all", hospitalVerificationController.getAllHospitals);
hospitalRouter.get("/hospitals/:hospitalId", hospitalVerificationController.getHospitalDetails);

// Blood request approval/rejection
hospitalRouter.post("/hospital/approve-request/:requestId", authMiddleware, hospitalOnly, hospitalVerifyBlood.approveBloodRequest);
hospitalRouter.post("/hospital/reject-request/:requestId", authMiddleware, hospitalOnly, hospitalVerifyBlood.rejectBloodRequest);

// NEW: Admin donor allocation routes
hospitalRouter.post(
  "/admin/send-to-donor/:requestId",
  authMiddleware,
  adminOnly,
  adminDonorAllocationController.sendRequestToNextDonor
);

hospitalRouter.get(
  "/admin/pending-actions",
  authMiddleware,
  adminOnly,
  adminDonorAllocationController.getPendingAdminActions
);

hospitalRouter.get(
  "/admin/active-requests",
  authMiddleware,
  adminOnly,
  adminDonorAllocationController.getActiveRequests
);

hospitalRouter.get(
  "/admin/request-details/:requestId",
  authMiddleware,
  adminOnly,
  adminDonorAllocationController.getRequestWithDonorQueue
);

module.exports = hospitalRouter;