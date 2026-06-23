const express = require("express");
const requestController = require("../controllers/requestController");
const acceptController = require("../controllers/acceptController");
const hospitalSelectionController = require("../controllers/hospitalSelectionController");
const authMiddleware = require("../middlewares/authMiddleware");
const donorOnly = require("../middlewares/donorOnlyMiddleware");
const hospitalOnly = require("../middlewares/hospitalOnlyMiddleware");

const requestRouter = express.Router();

// Receiver routes - Create and view own requests
requestRouter.post("/requests/create",authMiddleware,requestController.createRequest);
requestRouter.get("/requests/my-requests",authMiddleware,requestController.myRequests);
requestRouter.get("/requests/:requestId/accepted-donors",authMiddleware,requestController.viewAcceptedDonors);

// Public route - View all pending requests
requestRouter.get("/requests/view",requestController.viewRequests);

// Get specific request detail
requestRouter.get("/requests/:requestId/detail",authMiddleware,requestController.getRequestDetail);

// Donor routes - Accept requests
requestRouter.post("/requests/:requestId/accept",authMiddleware,donorOnly,acceptController.acceptRequest);

// Hospital routes - View requests and select donors
requestRouter.get("/hospital/requests",authMiddleware,hospitalOnly,requestController.getHospitalRequests);
requestRouter.post("/requests/:requestId/hospital-select-donor",authMiddleware,hospitalOnly,hospitalSelectionController.selectAndVerifyDonors);

module.exports = requestRouter;