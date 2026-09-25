// sendEmail.js - Reusable email dispatch utility supporting Brevo, Gmail SMTP, and Dev Console fallback

const getTransporterConfig = () => {
    const emailUser = (process.env.SMTP_USER || process.env.SMTP_EMAIL || process.env.SMTP_FROM || '').trim();
    const emailPass = (process.env.SMTP_PASSWORD || process.env.SMTP_PASS || '').trim().replace(/\s+/g, '');
    const host = (process.env.SMTP_HOST || '').trim().toLowerCase();

    // Automatically detect Gmail if user has @gmail.com or host is gmail
    const isGmail =
        emailPass &&
        !emailPass.includes('YOUR_') &&
        (
            host.includes('gmail') ||
            emailUser.toLowerCase().includes('@gmail.com') ||
            (process.env.SMTP_EMAIL && !process.env.SMTP_EMAIL.includes('YOUR_GMAIL'))
        );

    if (isGmail) {
        return {
            type: 'gmail',
            config: {
                service: 'gmail',
                auth: {
                    user: emailUser,
                    pass: emailPass,
                },
                connectionTimeout: 10000,
                greetingTimeout: 10000,
                socketTimeout: 15000,
            },
        };
    }

    const isGenericSmtp =
        host &&
        !host.includes('YOUR_') &&
        emailUser &&
        emailPass;

    if (isGenericSmtp) {
        const port = parseInt(process.env.SMTP_PORT, 10) || 587;
        return {
            type: 'generic',
            config: {
                host,
                port,
                secure: port === 465,
                auth: {
                    user: emailUser,
                    pass: emailPass,
                },
                tls: {
                    rejectUnauthorized: false,
                },
                connectionTimeout: 10000,
                greetingTimeout: 10000,
                socketTimeout: 15000,
            },
        };
    }

    return null;
};

const verifySmtpConnection = async () => {
    let nodemailerModule = null;
    try {
        nodemailerModule = require('nodemailer');
    } catch {
        console.warn('⚠️ [SMTP] Nodemailer module is not installed.');
        return { success: false, error: 'nodemailer not installed' };
    }

    const transportInfo = getTransporterConfig();
    if (!transportInfo) {
        console.log('ℹ️ [SMTP] No SMTP credentials configured. System will display OTPs in the server terminal.');
        return { success: false, fallback: true };
    }

    try {
        const transporter = nodemailerModule.createTransport(transportInfo.config);
        await transporter.verify();
        const host = transportInfo.type === 'gmail' ? 'Gmail Direct SMTP' : transportInfo.config.host;
        const sender = process.env.SMTP_FROM || process.env.SMTP_EMAIL || process.env.SMTP_USER;
        console.log(`✅ [SMTP READY] Successfully connected and authenticated with ${host} (From: ${sender})`);
        return { success: true };
    } catch (err) {
        console.error(`\n❌ [SMTP VERIFICATION FAILED] Could not authenticate with email server:`);
        console.error(`   Error Message: ${err.message}`);
        if (err.code) console.error(`   Error Code: ${err.code}`);
        if (err.response) console.error(`   Server Response: ${err.response}`);
        
        if (err.response && (err.response.includes('550') || err.message.includes('550'))) {
            console.error(`\n👉 BREVO FIX NEEDED: The sender "${process.env.SMTP_FROM}" is NOT a verified sender in Brevo!`);
            console.error(`   1. Go to Brevo Dashboard -> Senders & IP -> Senders.`);
            console.error(`   2. Add "${process.env.SMTP_FROM}" and click the verification link sent to your Gmail inbox.`);
            console.error(`   3. OR switch to direct Gmail App Password in BACKEND/.env (SMTP_EMAIL & SMTP_PASSWORD).\n`);
        }
        return { success: false, error: err.message, details: err };
    }
};

const sendMailHelper = async ({ to, subject, html, text, otp, logTitle = "Notification" }) => {
    let nodemailerModule = null;
    try {
        nodemailerModule = require('nodemailer');
    } catch {
        // nodemailer not installed locally
    }

    // Always log to terminal as backup so user/developer is never locked out
    if (otp) {
        console.log(`\n======================================================`);
        console.log(`🔑 ${logTitle.toUpperCase()} for ${to}: [ ${otp} ]`);
        console.log(`   (Valid for 10 minutes | HemoBridge Service)`);
        console.log(`======================================================\n`);
    } else {
        console.log(`\n📧 ${logTitle.toUpperCase()} dispatched to ${to}: "${subject}"`);
    }

    const transportInfo = getTransporterConfig();
    if (!nodemailerModule || !transportInfo) {
        return { success: true, delivered: false, fallback: true };
    }

    try {
        const transporter = nodemailerModule.createTransport(transportInfo.config);

        let sender = process.env.SMTP_FROM || process.env.SMTP_EMAIL || process.env.SMTP_USER || "hemobridge.support@gmail.com";
        sender = sender.trim();
        const fromAddress = sender.includes('<') ? sender : `"HemoBridge Support" <${sender}>`;

        const info = await transporter.sendMail({
            from: fromAddress,
            to,
            subject,
            html,
            ...(text ? { text } : {})
        });

        console.log(`✅ [EMAIL DELIVERED] "${subject}" sent to ${to} (MessageId: ${info.messageId})`);
        return { success: true, delivered: true, messageId: info.messageId };
    } catch (err) {
        console.error(`\n❌ [SMTP DELIVERY FAILED] Could not send email (${logTitle}) to ${to}:`);
        console.error(`   Error Message: ${err.message}`);
        if (err.code) console.error(`   Code: ${err.code}`);
        if (err.responseCode) console.error(`   ResponseCode: ${err.responseCode}`);
        if (err.response) console.error(`   Server Response: ${err.response}`);

        if (err.response && (err.response.includes('550') || err.message.includes('550'))) {
            console.error(`   👉 BREVO ISSUE: Sender address not verified in Brevo account! Verify it at https://app.brevo.com/senders`);
        }

        return { success: false, delivered: false, error: err.message, details: err };
    }
};

module.exports = { sendMailHelper, verifySmtpConnection };

