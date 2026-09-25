// sendEmail.js - Reusable email dispatch utility supporting Brevo HTTPS API, Resend HTTPS API, Gmail SMTP, and Dev Console fallback

const getHttpApiConfig = () => {
    const rawKey = (
        process.env.BREVO_API_KEY ||
        process.env.RESEND_API_KEY ||
        process.env.SMTP_PASSWORD ||
        process.env.SMTP_PASS ||
        ''
    ).trim();

    if (process.env.RESEND_API_KEY || rawKey.startsWith('re_')) {
        return {
            type: 'resend_http',
            apiKey: rawKey,
        };
    }

    if (process.env.BREVO_API_KEY || rawKey.startsWith('xkeysib-')) {
        return {
            type: 'brevo_http',
            apiKey: rawKey,
        };
    }

    return null;
};

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
                host: 'smtp.gmail.com',
                port: 465,
                secure: true,
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
    const httpConfig = getHttpApiConfig();

    if (httpConfig) {
        try {
            if (httpConfig.type === 'brevo_http') {
                console.log('ℹ️ [EMAIL INIT] Authenticating with Brevo HTTPS REST API (Port 443)...');
                const res = await fetch('https://api.brevo.com/v3/account', {
                    headers: { 'api-key': httpConfig.apiKey }
                });
                if (res.ok) {
                    const acc = await res.json();
                    console.log(`✅ [SMTP READY] Connected to Brevo HTTPS API (Account: ${acc.email})`);
                    return { success: true, host: 'Brevo HTTPS API (Port 443)', sender: acc.email, type: 'brevo_http' };
                } else {
                    const errData = await res.json().catch(() => ({}));
                    throw new Error(errData.message || `Brevo API HTTP ${res.status}`);
                }
            } else if (httpConfig.type === 'resend_http') {
                console.log('ℹ️ [EMAIL INIT] Authenticating with Resend HTTPS REST API (Port 443)...');
                const res = await fetch('https://api.resend.com/api-keys', {
                    headers: { 'Authorization': `Bearer ${httpConfig.apiKey}` }
                });
                if (res.ok) {
                    console.log(`✅ [SMTP READY] Connected to Resend HTTPS API (Port 443)`);
                    return { success: true, host: 'Resend HTTPS API (Port 443)', type: 'resend_http' };
                } else {
                    const errData = await res.json().catch(() => ({}));
                    throw new Error(errData.message || `Resend API HTTP ${res.status}`);
                }
            }
        } catch (httpErr) {
            console.error(`❌ [HTTP API AUTH FAILED] Could not authenticate with ${httpConfig.type}: ${httpErr.message}`);
            return { success: false, error: httpErr.message, type: httpConfig.type };
        }
    }

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
        return { success: false, fallback: true, error: 'No SMTP credentials configured' };
    }

    try {
        const hostDesc = `${transportInfo.config.host || 'smtp.gmail.com'}:${transportInfo.config.port || 465}`;
        console.log(`ℹ️ [SMTP CONNECTING] Contacting ${hostDesc} (SSL: ${Boolean(transportInfo.config.secure)}) for user: "${transportInfo.config.auth.user}"...`);
        const transporter = nodemailerModule.createTransport(transportInfo.config);
        await transporter.verify();
        const host = transportInfo.type === 'gmail' ? 'Gmail Direct SMTP (Port 465 SSL)' : transportInfo.config.host;
        const sender = process.env.SMTP_FROM || process.env.SMTP_EMAIL || process.env.SMTP_USER;
        console.log(`✅ [SMTP READY] Successfully connected and authenticated with ${host} (From: ${sender})`);
        return { success: true, host, sender, type: transportInfo.type };
    } catch (err) {
        console.error(`\n❌ [SMTP VERIFICATION FAILED] Could not authenticate with email server:`);
        console.error(`   Error Message: ${err.message}`);
        if (err.code) console.error(`   Error Code: ${err.code}`);
        if (err.response) console.error(`   Server Response: ${err.response}`);

        if (err.code === 'ETIMEDOUT') {
            console.error(`\n👉 RENDER FREE TIER NOTICE: Render blocks all outbound SMTP ports (25, 465, 587) on Free Tier!`);
            console.error(`   Solution: Add BREVO_API_KEY (xkeysib-...) or RESEND_API_KEY (re_...) to Render Environment.`);
            console.error(`   HTTP APIs communicate over Port 443 (HTTPS), which is 100% open and never blocked.\n`);
        }
        
        return { 
            success: false, 
            error: err.message, 
            code: err.code, 
            response: err.response, 
            type: transportInfo.type 
        };
    }
};

const sendMailHelper = async ({ to, subject, html, text, otp, logTitle = "Notification" }) => {
    // Always log to terminal as backup so user/developer is never locked out
    if (otp) {
        console.log(`\n======================================================`);
        console.log(`🔑 ${logTitle.toUpperCase()} for ${to}: [ ${otp} ]`);
        console.log(`   (Valid for 10 minutes | HemoBridge Service)`);
        console.log(`======================================================\n`);
    } else {
        console.log(`\n📧 ${logTitle.toUpperCase()} dispatched to ${to}: "${subject}"`);
    }

    const httpConfig = getHttpApiConfig();
    if (httpConfig) {
        try {
            let messageId;
            let sender = (process.env.SMTP_FROM || process.env.SMTP_EMAIL || process.env.SMTP_USER || "hemobridge.support@gmail.com").trim();
            const textContent = text || (html ? html.replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim() : '');

            if (httpConfig.type === 'brevo_http') {
                const res = await fetch('https://api.brevo.com/v3/smtp/email', {
                    method: 'POST',
                    headers: {
                        'accept': 'application/json',
                        'api-key': httpConfig.apiKey,
                        'content-type': 'application/json'
                    },
                    body: JSON.stringify({
                        sender: {
                            name: "HemoBridge Support",
                            email: sender
                        },
                        replyTo: {
                            email: "hemobridge.support@gmail.com",
                            name: "HemoBridge Support"
                        },
                        to: [{ email: to }],
                        subject,
                        htmlContent: html,
                        textContent: textContent
                    })
                });
                const data = await res.json();
                if (!res.ok) {
                    throw new Error(data.message || JSON.stringify(data));
                }
                messageId = data.messageId;
            } else if (httpConfig.type === 'resend_http') {
                const fromHeader = sender.includes('@') && !sender.endsWith('@gmail.com')
                    ? `HemoBridge Support <${sender}>`
                    : 'HemoBridge Support <onboarding@resend.dev>';

                const res = await fetch('https://api.resend.com/emails', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${httpConfig.apiKey}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        from: fromHeader,
                        to: [to],
                        reply_to: 'hemobridge.support@gmail.com',
                        subject,
                        html,
                        text: textContent
                    })
                });
                const data = await res.json();
                if (!res.ok) {
                    throw new Error(data.message || JSON.stringify(data));
                }
                messageId = data.id;
            }

            console.log(`✅ [EMAIL DELIVERED VIA HTTPS API] "${subject}" sent to ${to} (MessageId: ${messageId})`);
            return { success: true, delivered: true, messageId };
        } catch (err) {
            console.error(`\n❌ [HTTP API DELIVERY FAILED] Could not send email (${logTitle}) to ${to}: ${err.message}`);
            return { success: false, delivered: false, error: err.message, details: err };
        }
    }

    let nodemailerModule = null;
    try {
        nodemailerModule = require('nodemailer');
    } catch {
        // nodemailer not installed locally
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

        return { success: false, delivered: false, error: err.message, details: err };
    }
};

module.exports = { sendMailHelper, verifySmtpConnection, getTransporterConfig, getHttpApiConfig };

