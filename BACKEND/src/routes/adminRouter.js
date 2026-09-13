const express = require("express");
const adminRouter = express.Router();
const adminVerificationController = require("../controllers/adminVerificationController");
const authMiddleware = require("../middlewares/authMiddleware");
const adminOnlyMiddleware = require("../middlewares/adminOnlyMiddleware");

// All admin routes require auth + admin role
adminRouter.use("/admin", authMiddleware, adminOnlyMiddleware);

// Dashboard data
adminRouter.get("/admin/pending-hospitals", adminVerificationController.getPendingHospitals);
adminRouter.get("/admin/all-requests", adminVerificationController.getAllRequests);

// Hospital verification
adminRouter.post("/admin/verify-hospital/:hospitalId", adminVerificationController.adminVerifyHospital);

// Existing donor verification routes
adminRouter.get("/admin/requests/:requestId/acceptances", adminVerificationController.getAcceptedDonors);
adminRouter.post("/admin/requests/:requestId/select-donor", adminVerificationController.selectDonorForVerification);
adminRouter.get("/admin/pending-verifications", adminVerificationController.getPendingAdminVerifications);

module.exports = adminRouter;
