const express = require("express");
const requestController = require("../controllers/requestController");
const acceptController = require("../controllers/acceptController");

const authMiddleware = require("../middlewares/authMiddleware");
const donorOnly = require("../middlewares/donorOnlyMiddleware");
const hospitalOnly = require("../middlewares/hospitalOnlyMiddleware");

const requestRouter = express.Router();

// Receiver
requestRouter.post("/requests/create",authMiddleware,requestController.createRequest);

requestRouter.get("/requests/my-requests",authMiddleware,requestController.myRequests);

// Public
requestRouter.get("/requests/view",requestController.viewRequests);

// Details
requestRouter.get("/requests/:requestId/detail",authMiddleware,requestController.getRequestDetail);

// Donor
requestRouter.post("/requests/:requestId/accept",authMiddleware,donorOnly,acceptController.acceptRequest);

// Add later
requestRouter.post("/requests/:requestId/reject",authMiddleware,donorOnly,acceptController.rejectRequest);

// Hospital
requestRouter.get("/hospital/requests",authMiddleware,hospitalOnly,requestController.getHospitalRequests);

requestRouter.post("/requests/:requestId/reject",authMiddleware,donorOnly,acceptController.rejectRequest);

module.exports = requestRouter;