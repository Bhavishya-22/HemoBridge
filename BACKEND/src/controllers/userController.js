//userController.js
const asyncHandler = require('express-async-handler');
const bcrypt = require('bcryptjs'); 
const crypto = require('crypto');
const User = require('../model/userModel');
const jwt = require("jsonwebtoken");


// Declared separately because it’s reusable across register, login, and refresh flows.
// Generates access and refresh tokens, saves refresh token in DB without requiring password validation again.
const generateAccessandRefreshTokens = asyncHandler(async(userId) => {
    try {
        const user = await User.findById(userId);
        const accessToken = await user.generateAccessToken();
        const refreshToken = await user.generateRefreshToken();
        user.refreshToken = refreshToken;
        await user.save({validateBeforeSave: false});// avoids password re-validation
        return {accessToken, refreshToken};
    } catch (error) {
        throw new Error("Could not generate tokens");
    }
});



// Collects user data from request body.
// Validates required fields, checks if user already exists.
// If not, creates new user and issues tokens.
// Sends success response with payload to frontend.
exports.userRegister = asyncHandler(async (req, res) => {
    const { username, fullName, email, password, role } = req.body;

    // Validation
    if (!email || !username || !fullName || !password) {
        return res.status(400).json({ 
            success: false,
            message: "Full name, username, email, and password are required" 
        });
    }

    // Validate role if provided, otherwise default to "donor"
    const userRole = role ? role.toLowerCase().trim() : "donor";
    const validRoles = ["donor", "receiver", "hospital", "admin"];
    if (!validRoles.includes(userRole)) {
        return res.status(400).json({ 
            success: false,
            message: "Invalid role selected" 
        });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ 
        $or: [{ email: email.toLowerCase().trim() }, { username: username.toLowerCase().trim() }]
    });

    if (existingUser) {
        return res.status(400).json({ 
            success: false,
            message: "User with this email or username already exists" 
        });
    }

    // Create new user
    const newUser = await User.create({
        username: username.toLowerCase().trim(),
        fullName: fullName.trim(),
        email: email.toLowerCase().trim(),
        password,
        role: userRole,
        isVerified: true
    });

    const { accessToken, refreshToken } = await generateAccessandRefreshTokens(newUser._id);

    res
        .cookie("accessToken", accessToken, {
            httpOnly: true,
            secure: false,
            sameSite: "strict",
            maxAge: 15 * 60 * 1000,
        })
        .cookie("refreshToken", refreshToken, {
            httpOnly: true,
            secure: false,
            sameSite: "strict",
            maxAge: 24 * 60 * 60 * 1000,
        })
        .status(201)
        .json({
            success: true,
            message: "User registered successfully",
            user: {
                id: newUser._id,
                username: newUser.username,
                email: newUser.email,
                fullName: newUser.fullName,
                role: newUser.role,
                profileCompleted: newUser.profileCompleted
            }
        });
});

const isProduction = process.env.NODE_ENV === "production";
const getAuthCookieOptions = (maxAge) => ({
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
    ...(maxAge ? { maxAge } : {}),
    path: "/",
});

// Accepts either email OR username along with password.
// Validates credentials, checks if user exists, compares password.
// Issues new tokens and sets them in cookies.
exports.userLogin = asyncHandler(async (req, res) => {
    const { email, username, password } = req.body;

    if ((!email && !username) || !password) {
        return res.status(400).json({
            success: false,
            message: "Email/Username and Password are required"
        });
    }

const isExistingUser = await User.findOne({
    $or: [
        { email },
        { username }
    ]
}).select("+password +refreshToken");

    if (!isExistingUser) {
        return res.status(404).json({
            success: false,
            message: "User not found"
        });
    }

    if (isExistingUser.isBlocked) {
        return res.status(403).json({
            success: false,
            message: "Your account has been blocked"
        });
    }

    const isPasswordCorrect = await isExistingUser.comparePassword(password);

    if (!isPasswordCorrect) {
        return res.status(401).json({
            success: false,
            message: "Invalid credentials"
        });
    }

    const { accessToken, refreshToken } = await generateAccessandRefreshTokens(isExistingUser._id);

    res
        .cookie("accessToken", accessToken, getAuthCookieOptions(15 * 60 * 1000))
        .cookie("refreshToken", refreshToken, getAuthCookieOptions(24 * 60 * 60 * 1000))
        .json({
            success: true,
            message: "Login successful",
            user: {
                id: isExistingUser._id,
                username: isExistingUser.username,
                email: isExistingUser.email,
                fullName: isExistingUser.fullName,
                role: isExistingUser.role,
                location: isExistingUser.location,
                bloodGroup: isExistingUser.bloodGroup,
                profileCompleted: isExistingUser.profileCompleted,
                hospitalVerified: isExistingUser.hospitalVerified
            }
        });
});

// Useful for frontend navigation.
// Returns whether profile is completed and the next page route
exports.checkProfileCompletion = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user.id);

    res.status(200).json({
        success: true,
        profileCompleted: user.profileCompleted,
        role: user.role,
        hospitalVerified: user.hospitalVerified,
        nextPage: user.profileCompleted ? "/home" : "/update-profile"
    });
});

// Clears refresh token from DB.
// Clears cookies for accessToken and refreshToken.
// Returns logout success response.
exports.userLogout = asyncHandler(async (req, res) => {
    await User.findByIdAndUpdate(
        req.user.id,
        { $unset: { refreshToken: 1 } },
        { new: true }
    );

    res.status(200)
        .clearCookie("accessToken", getAuthCookieOptions())
        .clearCookie("refreshToken", getAuthCookieOptions())
        .json({
            success: true,
            message: "Logout successful",
            user: {
                id: req.user.id,
                email: req.user.email,
                fullName: req.user.fullName,
                username: req.user.username
            }
        });
});

// Verifies refresh token validity and matches DB.
// Issues new access and refresh tokens.
// Rotates refresh token and sends updated cookies.
exports.refreshAccessToken = asyncHandler(async (req, res) => {
    const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken;

    if (!incomingRefreshToken) {
        return res.status(401).json({ 
            success: false,
            message: "No refresh token provided" 
        });
    }

    try {
        const decoded = jwt.verify(incomingRefreshToken, process.env.JWT_REFRESH_SECRET);
        const user = await User.findById(decoded.id);

        if (!user) {
            return res.status(401).json({ 
                success: false,
                message: "User not found" 
            });
        }

        if (incomingRefreshToken !== user.refreshToken) {
            return res.status(401).json({ 
                success: false,
                message: "Refresh token is invalid or has been rotated" 
            });
        }

        const { accessToken, refreshToken: newRefreshToken } = await generateAccessandRefreshTokens(user._id);

        res
            .cookie("accessToken", accessToken, getAuthCookieOptions(15 * 60 * 1000))
            .cookie("refreshToken", newRefreshToken, getAuthCookieOptions(24 * 60 * 60 * 1000))
            .status(200)
            .json({ 
                success: true,
                message: "Access token refreshed successfully" 
            });

    } catch (error) {
        return res.status(401).json({ 
            success: false,
            message: "Refresh token expired or invalid" 
        });
    }
});

const BloodRequest = require('../model/bloodRequestModel');

// Updates user profile fields and marks profile as completed.
// Excludes password and refreshToken from response.
exports.userUpdateProfile = asyncHandler(async (req, res) => {
    const {
        fullName,
        phoneNumber,
        bloodGroup,
        age,
        weight,
        height,
        diseases,
        location,
        role,
        hospitalName,
        registrationNumber,
        hospitalAddress,
        hospitalPhone,
    } = req.body;

    const user = await User.findById(req.user.id);
    if (!user) {
        return res.status(404).json({ success: false, message: "User not found" });
    }

    const validRoles = ["donor", "receiver", "hospital"];
    const targetRole =
        role && validRoles.includes(role) && user.role !== "admin" ? role : user.role;

    let updateData = {};

    if (fullName && fullName.trim()) {
        updateData.fullName = fullName.trim();
    }

    if (targetRole === "hospital") {
        updateData = {
            ...updateData,
            role: targetRole,
            phoneNumber: phoneNumber || user.phoneNumber,
            hospitalName: hospitalName || user.hospitalName,
            registrationNumber: registrationNumber || user.registrationNumber,
            hospitalAddress: hospitalAddress || user.hospitalAddress,
            hospitalPhone: hospitalPhone || user.hospitalPhone,
            profileCompleted: true,
            isVerified: true,
        };
    } else {
        updateData = {
            ...updateData,
            role: targetRole,
            phoneNumber: phoneNumber || user.phoneNumber,
            bloodGroup: bloodGroup || user.bloodGroup,
            age: age !== undefined && age !== "" ? Number(age) : user.age,
            weight: weight !== undefined && weight !== "" ? Number(weight) : user.weight,
            height: height !== undefined && height !== "" ? Number(height) : user.height,
            diseases: diseases !== undefined ? diseases : user.diseases,
            profileCompleted: true,
            isVerified: true,
        };
    }

    if (location) {
        const existingLocation =
            user.location && typeof user.location.toObject === "function"
                ? user.location.toObject()
                : user.location || {};

        updateData.location = {
            ...existingLocation,
            city: location.city !== undefined ? location.city : existingLocation.city || "",
            state: location.state !== undefined ? location.state : existingLocation.state || "",
        };

        if (location.coordinates?.lat != null && location.coordinates?.lng != null) {
            updateData.location.coordinates = {
                type: "Point",
                coordinates: [Number(location.coordinates.lng), Number(location.coordinates.lat)],
            };
        } else if (
            location.coordinates &&
            Array.isArray(location.coordinates.coordinates) &&
            location.coordinates.coordinates.length === 2
        ) {
            updateData.location.coordinates = {
                type: "Point",
                coordinates: location.coordinates.coordinates,
            };
        } else if (
            Array.isArray(location.coordinates) &&
            location.coordinates.length === 2
        ) {
            updateData.location.coordinates = {
                type: "Point",
                coordinates: [Number(location.coordinates[0]), Number(location.coordinates[1])],
            };
        }
    }

    const updatedUser = await User.findByIdAndUpdate(
        req.user.id,
        updateData,
        { returnDocument: "after" }
    ).select("-password -refreshToken");

    // Dynamically synchronize active open requests created by this user
    // so any distance calculations / hospital routing immediately reflect the new location
    if (updateData.location) {
        try {
            await BloodRequest.updateMany(
                {
                    requestedBy: req.user.id,
                    status: { $in: ["pending_hospital_approval", "waiting_for_donor"] },
                },
                {
                    $set: { location: updateData.location },
                }
            );
        } catch (syncErr) {
            console.warn("Could not sync location to active requests:", syncErr.message);
        }
    }

    res.status(200).json({
        success: true,
        message: "Profile updated successfully",
        user: updatedUser,
    });
});

// Fetches user profile excluding sensitive fields.
// Returns profile data if user exists.
exports.userProfileDetails = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user.id).select("-password -refreshToken");

    if (!user) {
        return res.status(404).json({
            success: false,
            message: "User not found"
        });
    }

    res.status(200).json({
        success: true,
        message: "User profile",
        user
    });
});

exports.getHospitalRegistrationStatus = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user.id).select(
        "role hospitalVerificationStatus hospitalVerified hospitalVerificationNotes"
    );

    if (!user) {
        return res.status(404).json({
            success: false,
            message: "User not found"
        });
    }

    if (user.role !== "hospital") {
        return res.status(403).json({
            success: false,
            message: "Only hospitals can check registration status"
        });
    }

    res.status(200).json({
        success: true,
        hospitalVerificationStatus: user.hospitalVerificationStatus,
        hospitalVerified: user.hospitalVerified,
        hospitalVerificationNotes: user.hospitalVerificationNotes,
        message: user.hospitalVerified ? "Hospital is verified" : "Hospital is not verified yet"
    });
});

// ─── Google OAuth Login/Signup ──────────────────────────────────────────────
// Receives the Google credential (ID token) from the frontend.
// Verifies it using Google's tokeninfo endpoint (no library needed).
// Finds existing user by googleId or email; creates one if first-time.
// Issues access + refresh tokens via cookies.
exports.googleLogin = asyncHandler(async (req, res) => {
    const { credential, isDemo } = req.body;

    if (!credential && !isDemo) {
        return res.status(400).json({
            success: false,
            message: "Google credential is required"
        });
    }

    // Verify the ID token with Google (or handle demo mode for dev/preview)
    let googleUser;
    if (isDemo || credential === "demo-google-credential") {
        googleUser = {
            sub: "demo_google_user_998877",
            email: "google.donor@bloodbank.org",
            name: "Google Demo Donor",
            picture: ""
        };
    } else {
        try {
            const response = await fetch(
                `https://oauth2.googleapis.com/tokeninfo?id_token=${credential}`
            );
            if (!response.ok) {
                throw new Error("Invalid Google token");
            }
            googleUser = await response.json();
        } catch {
            return res.status(401).json({
                success: false,
                message: "Invalid Google credential"
            });
        }

        // Validate audience matches our client ID if configured
        if (process.env.GOOGLE_CLIENT_ID && !process.env.GOOGLE_CLIENT_ID.startsWith("YOUR_")) {
            if (googleUser.aud !== process.env.GOOGLE_CLIENT_ID) {
                return res.status(401).json({
                    success: false,
                    message: "Google token was not issued for this application"
                });
            }
        }
    }

    const { sub: googleId, email, name, picture } = googleUser;

    // Try to find existing user by googleId first, then by email
    let user = await User.findOne({ googleId });

    if (!user) {
        // Check if a local account exists with the same email
        user = await User.findOne({ email: email.toLowerCase() });

        if (user) {
            // Link Google ID to existing local account
            user.googleId = googleId;
            user.authProvider = user.authProvider === 'local' ? 'local' : 'google';
            await user.save({ validateBeforeSave: false });
        } else {
            // Create a new account for this Google user
            const baseUsername = email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
            let username = baseUsername;
            let counter = 1;
            while (await User.findOne({ username })) {
                username = `${baseUsername}${counter++}`;
            }

            user = await User.create({
                fullName: name || email.split('@')[0],
                username,
                email: email.toLowerCase(),
                googleId,
                authProvider: 'google',
                isVerified: true,
                role: 'donor',
            });
        }
    }

    if (user.isBlocked) {
        return res.status(403).json({
            success: false,
            message: "Your account has been blocked"
        });
    }

    const { accessToken, refreshToken } = await generateAccessandRefreshTokens(user._id);

    res
        .cookie("accessToken", accessToken, getAuthCookieOptions(15 * 60 * 1000))
        .cookie("refreshToken", refreshToken, getAuthCookieOptions(24 * 60 * 60 * 1000))
        .json({
            success: true,
            message: "Google login successful",
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                fullName: user.fullName,
                role: user.role,
                location: user.location,
                bloodGroup: user.bloodGroup,
                profileCompleted: user.profileCompleted,
                hospitalVerified: user.hospitalVerified
            }
        });
});

// Returns the public Google Client ID if configured in BACKEND/.env
exports.getGoogleClientId = asyncHandler(async (req, res) => {
    const clientId = process.env.GOOGLE_CLIENT_ID || "";
    const isConfigured = clientId && !clientId.startsWith("YOUR_") && clientId.trim().length > 10;
    res.json({
        success: true,
        clientId: isConfigured ? clientId.trim() : null
    });
});

// ─── Forgot Password ────────────────────────────────────────────────────────
// Accepts an email, generates a 6-digit OTP, hashes it and stores with 10-min expiry.
// Sends the plain OTP to the user's email via Nodemailer (Gmail SMTP).
exports.forgotPassword = asyncHandler(async (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({
            success: false,
            message: "Email is required"
        });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });

    if (!user) {
        // Don't reveal whether email exists — always return success
        return res.status(200).json({
            success: true,
            message: "If an account with that email exists, an OTP has been sent."
        });
    }

    // Google-only accounts cannot reset password
    if (user.authProvider === 'google' && !user.password) {
        return res.status(400).json({
            success: false,
            message: "This account uses Google sign-in. Please log in with Google."
        });
    }

    // Generate a 6-digit OTP
    const otp = crypto.randomInt(100000, 999999).toString();
    const hashedOTP = await bcrypt.hash(otp, 10);

    // Store hashed OTP with 10-minute expiry
    user.resetOTP = hashedOTP;
    user.resetOTPExpiry = new Date(Date.now() + 10 * 60 * 1000);
    await user.save({ validateBeforeSave: false });

    // Send OTP via email (or log to terminal in development if email not configured)
    let nodemailerModule = null;
    try {
        nodemailerModule = require('nodemailer');
    } catch {
        // nodemailer not installed locally yet
    }

    const hasSmtpCredentials =
        process.env.SMTP_EMAIL &&
        !process.env.SMTP_EMAIL.includes('YOUR_GMAIL') &&
        process.env.SMTP_PASSWORD &&
        !process.env.SMTP_PASSWORD.includes('YOUR_GMAIL');

    if (!nodemailerModule || !hasSmtpCredentials) {
        console.log(`\n======================================================`);
        console.log(`🔑 PASSWORD RESET OTP for ${user.email}: [ ${otp} ]`);
        console.log(`   (Valid for 10 minutes | Dev fallback active)`);
        console.log(`======================================================\n`);
        return res.status(200).json({
            success: true,
            message: "If an account with that email exists, an OTP has been sent."
        });
    }

    try {
        const transporter = nodemailerModule.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.SMTP_EMAIL,
                pass: process.env.SMTP_PASSWORD,
            },
        });

        await transporter.sendMail({
            from: `"BloodBank" <${process.env.SMTP_EMAIL}>`,
            to: user.email,
            subject: 'Password Reset OTP — BloodBank',
            html: `
                <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; background: #fff7f7; border-radius: 16px; border: 1px solid #f1c5c5;">
                    <h2 style="color: #b91c1c; margin: 0 0 8px;">🩸 BloodBank</h2>
                    <p style="color: #1e293b; font-size: 15px; margin: 0 0 24px;">We received a request to reset your password. Use the OTP below:</p>
                    <div style="background: #b91c1c; color: #fff; font-size: 32px; font-weight: 700; letter-spacing: 8px; text-align: center; padding: 16px; border-radius: 12px; margin: 0 0 24px;">
                        ${otp}
                    </div>
                    <p style="color: #64748b; font-size: 13px; margin: 0;">This OTP expires in <strong>10 minutes</strong>. If you didn't request this, please ignore this email.</p>
                </div>
            `,
        });
    } catch (emailErr) {
        console.error("Failed to send OTP email:", emailErr.message);
        return res.status(500).json({
            success: false,
            message: "Failed to send OTP email. Please try again later."
        });
    }

    res.status(200).json({
        success: true,
        message: "If an account with that email exists, an OTP has been sent."
    });
});

// ─── Reset Password ─────────────────────────────────────────────────────────
// Accepts email + OTP + new password. Verifies OTP against stored hash.
// If valid and not expired, hashes and sets the new password.
exports.resetPassword = asyncHandler(async (req, res) => {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword) {
        return res.status(400).json({
            success: false,
            message: "Email, OTP, and new password are required"
        });
    }

    if (newPassword.length < 8) {
        return res.status(400).json({
            success: false,
            message: "Password must be at least 8 characters"
        });
    }

    const user = await User.findOne({
        email: email.toLowerCase().trim()
    }).select("+resetOTP +resetOTPExpiry");

    if (!user || !user.resetOTP || !user.resetOTPExpiry) {
        return res.status(400).json({
            success: false,
            message: "Invalid or expired OTP"
        });
    }

    // Check expiry
    if (user.resetOTPExpiry < new Date()) {
        user.resetOTP = undefined;
        user.resetOTPExpiry = undefined;
        await user.save({ validateBeforeSave: false });
        return res.status(400).json({
            success: false,
            message: "OTP has expired. Please request a new one."
        });
    }

    // Verify OTP
    const isValidOTP = await bcrypt.compare(otp, user.resetOTP);
    if (!isValidOTP) {
        return res.status(400).json({
            success: false,
            message: "Invalid OTP"
        });
    }

    // Set new password and clear OTP fields
    user.password = newPassword;
    user.resetOTP = undefined;
    user.resetOTPExpiry = undefined;
    await user.save();

    res.status(200).json({
        success: true,
        message: "Password reset successfully. You can now log in with your new password."
    });
});