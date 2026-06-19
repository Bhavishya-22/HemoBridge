const mongoose = require("mongoose");

const DonationRecord = require("../model/donationRecordModel");
const BloodRequest = require("../model/bloodRequestModel");
const Notification = require("../model/notificationModel");

exports.verifyDonation = async (req, res) => {
  try {
    const donationId = req.params.id;
    console.log("1.donationID",donationId)
    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(donationId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Donation ID",
      });
    }

    const donation =await DonationRecord.findById(donationId);

    // Donation exists?
    if (!donation) {
      return res.status(404).json({
        success: false,
        message:
          "Donation record not found",
      });
    }
    console.log("2.req.user.id",req.user.id)
    console.log(donation.receiverId.toString())
    // Only receiver can verify
    if (donation.receiverId.toString() !==req.user.id) {
      return res.status(403).json({
        success: false,
        message:
          "Only receiver can verify this donation",
      });
    }

    // Already verified?
    if (
      donation.verificationStatus ===
      "verified"
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Donation already verified",
      });
    }

    // Verify donation
    donation.verificationStatus ="verified";

    donation.status = "verified";

    donation.verifiedBy = req.user.id;

    donation.verificationNotes ="Verified by receiver";

    donation.donationDate = new Date();

    await donation.save();

    // Update blood request
    await BloodRequest.findByIdAndUpdate(
      donation.requestId,
      {
        status: "completed",
      }
    );

    // Notify donor
    await Notification.create({
    recipientId: donation.donorId,
    message: `${req.user.fullName} verified your donation request and is ready to receive your blood.`,
    type: "donation_verified",
  });

    return res.status(200).json({
      success: true,
      message:
        "Donation verified successfully",
      donation,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};