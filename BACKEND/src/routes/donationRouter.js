const express = require("express");
const donationController = require("../controllers/donationController");
const authMiddleware = require("../middlewares/authMiddleware");
const donorOnly = require("../middlewares/donorOnlyMiddleware");
const hospitalOnly = require("../middlewares/hospitalOnlyMiddleware");

const donationRouter = express.Router();

// Common
donationRouter.get(
  "/donations/:donationId",
  authMiddleware,
  donationController.getDonationStatus
);

// Donor
donationRouter.get(
  "/donor/donations",
  authMiddleware,
  donorOnly,
  donationController.getDonorDonations
);

// Receiver
donationRouter.get(
  "/receiver/donations",
  authMiddleware,
  donationController.getReceiverDonations
);

// Hospital
donationRouter.get(
  "/hospital/donations",
  authMiddleware,
  hospitalOnly,
  donationController.getHospitalDonations
);

donationRouter.post(
  "/donations/:donationId/verify",
  authMiddleware,
  hospitalOnly,
  donationController.verifyDonation
);

module.exports = donationRouter;