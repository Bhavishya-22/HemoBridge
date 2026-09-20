// sendEmail.js - Reusable email dispatch utility supporting Brevo, Gmail SMTP, and Dev Console fallback
const sendMailHelper = async ({ to, subject, html, text, otp, logTitle = "Notification" }) => {
    let nodemailerModule = null;
    try {
        nodemailerModule = require('nodemailer');
    } catch {
        // nodemailer not installed locally yet
    }

    const isGenericSmtp =
        process.env.SMTP_HOST &&
        !process.env.SMTP_HOST.includes('YOUR_') &&
        (process.env.SMTP_USER || process.env.SMTP_EMAIL) &&
        (process.env.SMTP_PASS || process.env.SMTP_PASSWORD);

    const isGmailSmtp =
        process.env.SMTP_EMAIL &&
        !process.env.SMTP_EMAIL.includes('YOUR_GMAIL') &&
        process.env.SMTP_PASSWORD &&
        !process.env.SMTP_PASSWORD.includes('YOUR_GMAIL');

    const hasSmtpCredentials = isGenericSmtp || isGmailSmtp;

    if (otp) {
        console.log(`\n======================================================`);
        console.log(`🔑 ${logTitle.toUpperCase()} for ${to}: [ ${otp} ]`);
        console.log(`   (Valid for 10 minutes | BloodLink Service)`);
        console.log(`======================================================\n`);
    } else {
        console.log(`\n📧 ${logTitle.toUpperCase()} dispatched to ${to}: "${subject}"`);
    }

    if (!nodemailerModule || !hasSmtpCredentials) {
        return { success: true, delivered: false, fallback: true };
    }

    try {
        let transporterConfig;
        const senderEmail = process.env.SMTP_FROM || process.env.SMTP_USER || process.env.SMTP_EMAIL;

        if (isGenericSmtp) {
            const port = parseInt(process.env.SMTP_PORT, 10) || 587;
            transporterConfig = {
                host: process.env.SMTP_HOST,
                port,
                secure: port === 465,
                auth: {
                    user: process.env.SMTP_USER || process.env.SMTP_EMAIL,
                    pass: process.env.SMTP_PASS || process.env.SMTP_PASSWORD,
                },
            };
        } else {
            transporterConfig = {
                service: 'gmail',
                auth: {
                    user: process.env.SMTP_EMAIL,
                    pass: process.env.SMTP_PASSWORD,
                },
            };
        }

        const transporter = nodemailerModule.createTransport(transporterConfig);

        await transporter.sendMail({
            from: `"BloodLink" <${senderEmail}>`,
            to,
            subject,
            html,
            ...(text ? { text } : {})
        });
        return { success: true, delivered: true };
    } catch (err) {
        console.error(`❌ SMTP Delivery Error (${logTitle}):`, err.message);
        return { success: false, delivered: false, error: err.message };
    }
};

module.exports = { sendMailHelper };
