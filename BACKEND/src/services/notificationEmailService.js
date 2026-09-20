// notificationEmailService.js - Converts system notifications into direct emails sent to user's Google/registered mail
const mongoose = require("mongoose");
const { sendMailHelper } = require("../utils/sendEmail");

// Maps notification types to subject lines, badges, and colors
const getNotificationMetadata = (type, priority) => {
    switch (type) {
        // Hospital Approval
        case "hospital_approval_required":
            return {
                subject: "🏥 Action Required: New Blood Request Needs Hospital Approval",
                badge: "HOSPITAL ACTION REQUIRED",
                accentColor: "#d97706",
                icon: "🏥",
            };
        case "hospital_approved":
            return {
                subject: "✅ Good News: Your Blood Request Has Been Approved by Hospital",
                badge: "REQUEST APPROVED",
                accentColor: "#16a34a",
                icon: "✅",
            };
        case "hospital_rejected":
            return {
                subject: "⚠️ Update on Your Blood Request — Hospital Rejection Notice",
                badge: "REQUEST REJECTED",
                accentColor: "#dc2626",
                icon: "⚠️",
            };

        // Donor Matches & Urgent Requests
        case "donor_request":
        case "new_approved_request":
        case "blood_request":
        case "donor_notified":
            return {
                subject: "🚨 URGENT: Blood Needed for a Patient Near You",
                badge: "URGENT BLOOD ALERT",
                accentColor: "#dc2626",
                icon: "🚨",
            };

        case "donor_accepted":
            return {
                subject: "🤝 Donor Confirmed: A Donor Has Accepted the Blood Request",
                badge: "DONOR ACCEPTED",
                accentColor: "#16a34a",
                icon: "🤝",
            };

        case "donor_rejected":
        case "donor_declined":
            return {
                subject: "ℹ️ Request Update: Escalated to Next Matching Donor",
                badge: "MATCHING UPDATE",
                accentColor: "#64748b",
                icon: "ℹ️",
            };

        // Selection & Testing
        case "admin_selected_for_test":
        case "admin_selected_donor":
            return {
                subject: "🩸 Action Required: You Are Selected for Blood Donation Test",
                badge: "ACTION REQUIRED",
                accentColor: "#dc2626",
                icon: "🩸",
            };

        case "donor_on_backup":
            return {
                subject: "🛡️ Standby Confirmation: You Are on Backup for Blood Donation",
                badge: "BACKUP STANDBY",
                accentColor: "#2563eb",
                icon: "🛡️",
            };

        case "donor_timeout_escalated":
        case "next_donor_selected":
            return {
                subject: "⚡ Urgent Alert: You Are Next in Line for Blood Donation",
                badge: "IMMEDIATE RESPONSE NEEDED",
                accentColor: "#dc2626",
                icon: "⚡",
            };

        // Blood Test Steps
        case "blood_test_scheduled":
            return {
                subject: "🗓️ Blood Test Scheduled: Please Visit Hospital",
                badge: "APPOINTMENT SCHEDULED",
                accentColor: "#2563eb",
                icon: "🗓️",
            };

        case "blood_test_accepted":
            return {
                subject: "✅ Blood Test Cleared: You Are Ready for Blood Donation",
                badge: "TEST CLEARED",
                accentColor: "#16a34a",
                icon: "✅",
            };

        case "blood_test_rejected":
        case "blood_test_failed":
        case "blood_test_failed_next_donor":
            return {
                subject: "⚠️ Blood Test Result Update from Hospital",
                badge: "TEST UPDATE",
                accentColor: "#d97706",
                icon: "⚠️",
            };

        // Donation Complete & Gratitude
        case "blood_donation_thank_you":
        case "blood_donation_completed":
            return {
                subject: "❤️ Blood Donation Complete — Thank You for Saving a Life!",
                badge: "HERO DONOR THANK YOU",
                accentColor: "#b91c1c",
                icon: "❤️",
            };

        case "request_completed":
        case "request_fulfilled":
        case "receiver_thank_you":
        case "receiver_thank_you_accepted":
        case "receiver_thank_you_all":
            return {
                subject: "🎉 Blood Request Completed Successfully — BloodLink",
                badge: "REQUEST COMPLETED",
                accentColor: "#16a34a",
                icon: "🎉",
            };

        case "all_donors_exhausted":
        case "no_donors_available":
            return {
                subject: "⚠️ Urgent Alert: No Local Donors Currently Available",
                badge: "URGENT ESCALATION",
                accentColor: "#dc2626",
                icon: "⚠️",
            };

        default:
            return {
                subject: priority === "critical" ? "🚨 Critical Alert from BloodLink" : "🔔 Notification from BloodLink",
                badge: priority === "critical" ? "CRITICAL ALERT" : "NOTIFICATION",
                accentColor: priority === "critical" ? "#dc2626" : "#b91c1c",
                icon: "🔔",
            };
    }
};

/**
 * Dispatches an email to the notification recipient's registered Google/email address.
 * Called automatically whenever a Notification document is saved in MongoDB.
 */
const dispatchNotificationEmail = async (notificationDoc) => {
    if (!notificationDoc || !notificationDoc.recipientId) return;

    try {
        const User = mongoose.model("User");
        let recipient = notificationDoc.recipientId;

        // If recipientId is an ObjectId, fetch the User model
        if (!recipient.email) {
            recipient = await User.findById(notificationDoc.recipientId).select("fullName email role");
        }

        if (!recipient || !recipient.email) {
            return;
        }

        const clientUrl = process.env.CLIENT_URL || process.env.CORS_ORIGIN || "http://localhost:5173";
        const meta = getNotificationMetadata(notificationDoc.type, notificationDoc.priority);

        const html = `
            <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 540px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #fee2e2; box-shadow: 0 4px 20px rgba(0,0,0,0.05); overflow: hidden;">
                <!-- Header Banner -->
                <div style="background: linear-gradient(135deg, ${meta.accentColor} 0%, #991b1b 100%); padding: 24px; text-align: center; color: #ffffff;">
                    <div style="font-size: 38px; line-height: 1; margin-bottom: 6px;">${meta.icon}</div>
                    <span style="display: inline-block; background: rgba(255,255,255,0.2); font-size: 11px; font-weight: 700; letter-spacing: 1px; padding: 4px 10px; border-radius: 20px; text-transform: uppercase;">
                        ${meta.badge}
                    </span>
                    <h2 style="margin: 10px 0 0; font-size: 20px; font-weight: 800; color: #ffffff;">BloodLink Alert</h2>
                </div>

                <!-- Content Area -->
                <div style="padding: 28px 24px;">
                    <p style="color: #1e293b; font-size: 15px; margin: 0 0 16px;">
                        Hello <strong>${recipient.fullName || "User"}</strong>,
                    </p>

                    <div style="background: #fef2f2; border-left: 4px solid ${meta.accentColor}; padding: 16px 20px; border-radius: 8px; margin: 0 0 24px;">
                        <p style="color: #1e293b; font-size: 15px; line-height: 1.6; margin: 0; font-weight: 500;">
                            ${notificationDoc.message}
                        </p>
                    </div>

                    <!-- Call To Action Button -->
                    <div style="text-align: center; margin: 28px 0 20px;">
                        <a href="${clientUrl}" 
                           style="display: inline-block; background: ${meta.accentColor}; color: #ffffff; font-weight: 600; font-size: 14px; text-decoration: none; padding: 12px 28px; border-radius: 8px; box-shadow: 0 3px 10px rgba(0,0,0,0.15);">
                            Open BloodLink & View Details →
                        </a>
                    </div>

                    <p style="color: #64748b; font-size: 12px; line-height: 1.5; margin: 24px 0 0; text-align: center; border-top: 1px solid #f1f5f9; padding-top: 16px;">
                        This notification was delivered directly to your email (<strong>${recipient.email}</strong>) so you never miss an urgent request or update.
                    </p>
                </div>
            </div>
        `;

        await sendMailHelper({
            to: recipient.email,
            subject: meta.subject,
            html,
            logTitle: `Notification Email [${notificationDoc.type}]`
        });
    } catch (err) {
        console.warn("Notification email dispatch failed:", err.message);
    }
};

module.exports = {
    dispatchNotificationEmail,
    getNotificationMetadata,
};
