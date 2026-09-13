const express = require("express");
const requestController = require("../controllers/requestController");
const acceptController = require("../controllers/acceptController");
const adminVerificationController = require("../controllers/adminVerificationController");
const hospitalBloodTestController = require("../controllers/hospitalBloodTestController");

const authMiddleware = require("../middlewares/authMiddleware");
const donorOnly = require("../middlewares/donorOnlyMiddleware");
const hospitalOnly = require("../middlewares/hospitalOnlyMiddleware");
const adminOnly = require("../middlewares/adminOnlyMiddleware");
const receiverOnly = require("../middlewares/recieverOnlyMiddleware");

const requestRouter = express.Router();

// ============ RECEIVER ROUTES ============
// STEP 1: Receiver creates blood request
requestRouter.post("/requests/create", authMiddleware, receiverOnly, requestController.createRequest);

// Receiver views their own requests
requestRouter.get("/requests/my-requests", authMiddleware, receiverOnly, requestController.myRequests);

// ============ DONOR ROUTES ============
// Donor views compatible requests
requestRouter.get("/requests/view", authMiddleware, donorOnly, requestController.viewRequests);

// STEP 5: Donor accepts request
requestRouter.post("/requests/:requestId/accept", authMiddleware, donorOnly, acceptController.acceptRequest);

// STEP 6: Donor declines / rejects request (triggers automatic escalation to next donor)
requestRouter.post("/requests/:requestId/reject", authMiddleware, donorOnly, acceptController.rejectRequest);
requestRouter.post("/requests/:requestId/decline", authMiddleware, donorOnly, acceptController.rejectRequest);

// Donor views accepted / matched requests
requestRouter.get("/donor/my-acceptances", authMiddleware, donorOnly, acceptController.getDonorAcceptances);

// ============ TIMEOUT & ESCALATION ROUTES ============
// Check & trigger timeout escalation on-demand
requestRouter.post("/requests/:requestId/check-timeout", authMiddleware, requestController.checkTimeout);

// View persistent audit trail for a blood request
requestRouter.get("/requests/:requestId/audit-trail", authMiddleware, requestController.getRequestAuditTrail);

// ============ HOSPITAL ROUTES ============
// Hospital views pending requests to approve/reject
requestRouter.get("/hospital/requests", authMiddleware, hospitalOnly, requestController.getHospitalRequests);

// ============ ADMIN ROUTES ============
// STEP 4: Admin views all donors who accepted a request
requestRouter.get("/admin/accepted-donors/:requestId", authMiddleware, adminOnly, adminVerificationController.getAcceptedDonors);

// STEP 4: Admin selects ONE donor for verification
requestRouter.post("/admin/select-donor/:requestId", authMiddleware, adminOnly, adminVerificationController.selectDonorForVerification);

// Get all requests pending admin verification (Step 4)
requestRouter.get("/admin/pending-verifications", authMiddleware, adminOnly, adminVerificationController.getPendingAdminVerifications);

// ============ HOSPITAL BLOOD TEST ROUTES ============
// STEP 5: Hospital schedules blood test
requestRouter.post("/hospital/schedule-blood-test/:requestId", authMiddleware, hospitalOnly, hospitalBloodTestController.scheduleBloodTest);

// Get pending blood test verifications
requestRouter.get("/hospital/pending-blood-tests", authMiddleware, hospitalOnly, hospitalBloodTestController.getPendingBloodTestVerifications);

// ============ STEP 6: RECEIVER CONFIRMS BLOOD TEST RESULT ============
// STEP 6: Receiver confirms blood test SUCCESS
requestRouter.post("/receiver/confirm-blood-test-success/:requestId", authMiddleware, receiverOnly, hospitalBloodTestController.receiverConfirmSuccess);

// STEP 6: Receiver confirms blood test FAILURE
requestRouter.post("/receiver/confirm-blood-test-failure/:requestId", authMiddleware, receiverOnly, hospitalBloodTestController.receiverConfirmFailure);

// ============ REQUEST DETAIL ============
requestRouter.get("/requests/:requestId/detail", authMiddleware, requestController.getRequestDetail);

module.exports = requestRouter;