const express = require("express");

const donationController =
require("../controllers/donationController");

const authMiddleware =
require("../middlewares/authMiddleware");

const donationRouter =
express.Router();

donationRouter.post("/donations/verify/:id",authMiddleware,donationController.verifyDonation
);

module.exports = donationRouter;