const express = require("express");
const donationController = require("../controllers/donationController");
const authMiddleware = require("../middlewares/authMiddleware");
const donorOnly = require("../middlewares/donorOnlyMiddleware");
const hospitalOnly = require("../middlewares/hospitalOnlyMiddleware");

const donationRouter = express.Router();

// Get donation status (common)
donationRouter.get("/donations/:donationId",authMiddleware,donationController.getDonationStatus);

// Donor routes
donationRouter.get("/donor/donations",authMiddleware,donorOnly,donationController.getDonorDonations);
donationRouter.post("/donations/:donationId/initiate",authMiddleware,donorOnly,donationController.initiateDonation);
donationRouter.post("/donations/:donationId/complete",authMiddleware,donorOnly,donationController.completeDonation);

// Receiver routes
donationRouter.get("/receiver/donations",authMiddleware,donationController.getReceiverDonations);

// Hospital routes
donationRouter.get("/hospital/donations",authMiddleware,hospitalOnly,donationController.getHospitalDonations);
donationRouter.post("/donations/:donationId/verify",authMiddleware,hospitalOnly,donationController.verifyDonation);

module.exports = donationRouter;