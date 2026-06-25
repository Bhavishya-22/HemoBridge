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
requestRouter.post("/requests/create",authMiddleware,receiverOnly,requestController.createRequest);

// Receiver views their own requests
requestRouter.get("/requests/my-requests",authMiddleware,receiverOnly,requestController.myRequests);

// ============ DONOR ROUTES ============
// STEP 2 & 3: Donor views hospital-approved requests (KEY FIX)
requestRouter.get("/requests/view",authMiddleware,donorOnly,requestController.viewRequests);

// STEP 3: Donor accepts request
requestRouter.post("/requests/:requestId/accept",authMiddleware,donorOnly,acceptController.acceptRequest);

// STEP 3: Donor rejects request
requestRouter.post("/requests/:requestId/reject",authMiddleware,donorOnly,acceptController.rejectRequest);

// ============ HOSPITAL ROUTES ============
// Hospital views pending requests to approve/reject
requestRouter.get("/hospital/requests",authMiddleware,hospitalOnly,requestController.getHospitalRequests);

// ============ ADMIN ROUTES ============
// STEP 4: Admin views all donors who accepted a request
requestRouter.get("/admin/accepted-donors/:requestId",authMiddleware,adminOnly,adminVerificationController.getAcceptedDonors);

// STEP 4: Admin selects ONE donor for verification
requestRouter.post("/admin/select-donor/:requestId",authMiddleware,adminOnly,adminVerificationController.selectDonorForVerification);

// Get all requests pending admin verification (Step 4)
requestRouter.get("/admin/pending-verifications",authMiddleware,adminOnly,adminVerificationController.getPendingAdminVerifications);

// ============ HOSPITAL BLOOD TEST ROUTES ============
// STEP 5: Hospital schedules blood test
requestRouter.post("/hospital/schedule-blood-test/:requestId",authMiddleware,hospitalOnly,hospitalBloodTestController.scheduleBloodTest);

// Get pending blood test verifications
requestRouter.get("/hospital/pending-blood-tests",authMiddleware,hospitalOnly,hospitalBloodTestController.getPendingBloodTestVerifications);

// ============ STEP 6: RECEIVER CONFIRMS BLOOD TEST RESULT (directly sends final thank you) ============
// STEP 6: Receiver confirms blood test SUCCESS - Directly sets final_completed status and sends thank you to all donors
requestRouter.post("/receiver/confirm-blood-test-success/:requestId",authMiddleware,receiverOnly,hospitalBloodTestController.receiverConfirmSuccess);

// STEP 6: Receiver confirms blood test FAILURE - Loops to next donor or back to Step 2
requestRouter.post("/receiver/confirm-blood-test-failure/:requestId",authMiddleware,receiverOnly,hospitalBloodTestController.receiverConfirmFailure);

// ============ REQUEST DETAIL ============
requestRouter.get("/requests/:requestId/detail",authMiddleware,requestController.getRequestDetail);

module.exports = requestRouter;