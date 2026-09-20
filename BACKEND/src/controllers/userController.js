//userController.js
const asyncHandler = require('express-async-handler');
const bcrypt = require('bcryptjs'); 
const crypto = require('crypto');
const User = require('../model/userModel');
const jwt = require("jsonwebtoken");

const isProduction = process.env.NODE_ENV === "production";
const getAuthCookieOptions = (maxAge) => ({
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
    ...(maxAge ? { maxAge } : {}),
    path: "/",
});

const { sendMailHelper } = require("../utils/sendEmail");

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

// Step 1: Collects user registration data.
// For Donors and Receivers, generates a 6-digit Registration OTP and sends it via email.
// Account remains unverified (isVerified: false) until the OTP is submitted and confirmed.
exports.userRegister = asyncHandler(async (req, res) => {
    const { username, fullName, email, password, role } = req.body;

    // Validation
    if (!email || !username || !fullName || !password) {
        return res.status(400).json({ 
            success: false,
            message: "Full name, username, email, and password are required" 
        });
    }

    if (password.length < 8) {
        return res.status(400).json({
            success: false,
            message: "Password must be at least 8 characters"
        });
    }

    // Validate role if provided, default to "donor"
    const userRole = role ? role.toLowerCase().trim() : "donor";
    const validRoles = ["donor", "receiver", "hospital", "admin"];
    if (!validRoles.includes(userRole)) {
        return res.status(400).json({ 
            success: false,
            message: "Invalid role selected" 
        });
    }

    const cleanEmail = email.toLowerCase().trim();
    const cleanUsername = username.toLowerCase().trim();

    // Check if user already exists
    const existingUser = await User.findOne({ 
        $or: [{ email: cleanEmail }, { username: cleanUsername }]
    });

    // If an account exists and is already verified, reject duplicate registration
    if (existingUser && existingUser.isVerified) {
        return res.status(400).json({ 
            success: false,
            message: "An account with this email or username already exists. Please log in." 
        });
    }

    // Generate a 6-digit Registration OTP
    const otp = crypto.randomInt(100000, 999999).toString();
    const hashedOTP = await bcrypt.hash(otp, 10);
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    let targetUser;
    if (existingUser && !existingUser.isVerified) {
        // User started registration previously but hadn't verified OTP yet
        existingUser.fullName = fullName.trim();
        existingUser.username = cleanUsername;
        existingUser.password = password;
        existingUser.role = userRole;
        existingUser.registrationOTP = hashedOTP;
        existingUser.registrationOTPExpiry = otpExpiry;
        existingUser.isVerified = false;
        targetUser = await existingUser.save();
    } else {
        // Create new unverified user record
        targetUser = await User.create({
            username: cleanUsername,
            fullName: fullName.trim(),
            email: cleanEmail,
            password,
            role: userRole,
            isVerified: false,
            registrationOTP: hashedOTP,
            registrationOTPExpiry: otpExpiry,
        });
    }

    // Send Registration OTP Email
    const emailSubject = `Your BloodLink Registration OTP: ${otp}`;
    const emailHtml = `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 32px 24px; background: #fff7f7; border-radius: 16px; border: 1px solid #f1c5c5;">
            <div style="text-align: center; margin-bottom: 24px;">
                <span style="font-size: 42px;">🩸</span>
                <h2 style="color: #b91c1c; margin: 6px 0 2px; font-size: 24px; font-weight: 800;">BloodLink</h2>
                <p style="color: #64748b; font-size: 13px; margin: 0;">Connecting Donors & Receivers, Saving Lives</p>
            </div>
            <p style="color: #1e293b; font-size: 15px; margin: 0 0 16px;">Hello <strong>${targetUser.fullName}</strong>,</p>
            <p style="color: #1e293b; font-size: 15px; line-height: 1.5; margin: 0 0 24px;">
                Thank you for creating an account on <strong>BloodLink</strong>. Please use the 6-digit registration code below to verify your email and activate your account:
            </p>
            <div style="background: linear-gradient(135deg, #b91c1c 0%, #dc2626 100%); color: #fff; font-size: 32px; font-weight: 700; letter-spacing: 8px; text-align: center; padding: 16px; border-radius: 12px; margin: 0 0 24px; box-shadow: 0 4px 12px rgba(185, 28, 28, 0.25);">
                ${otp}
            </div>
            <p style="color: #64748b; font-size: 13px; margin: 0 0 12px;">This verification code is valid for <strong>10 minutes</strong>.</p>
            <p style="color: #94a3b8; font-size: 12px; margin: 0;">If you did not initiate this registration on BloodLink, please ignore this email.</p>
        </div>
    `;

    await sendMailHelper({
        to: targetUser.email,
        subject: emailSubject,
        html: emailHtml,
        otp,
        logTitle: 'Registration OTP'
    });

    return res.status(200).json({
        success: true,
        requireOtp: true,
        email: targetUser.email,
        message: `A 6-digit verification code has been sent to ${targetUser.email}. Please enter the OTP to complete registration.`
    });
});

// Step 2: Verifies Registration OTP, activates the account, and issues authentication cookies.
// The welcome email is sent after the user completely fills their profile details.
exports.verifyRegistrationOTP = asyncHandler(async (req, res) => {
    const { email, otp } = req.body;

    if (!email || !otp) {
        return res.status(400).json({
            success: false,
            message: "Email and OTP code are required"
        });
    }

    const cleanEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: cleanEmail })
        .select("+registrationOTP +registrationOTPExpiry");

    if (!user) {
        return res.status(404).json({
            success: false,
            message: "No registration session found for this email. Please sign up again."
        });
    }

    if (user.isVerified) {
        return res.status(400).json({
            success: false,
            message: "This account has already been verified. Please log in directly."
        });
    }

    if (!user.registrationOTP || !user.registrationOTPExpiry) {
        return res.status(400).json({
            success: false,
            message: "No pending OTP verification. Please request a new verification code."
        });
    }

    // Check expiry
    if (user.registrationOTPExpiry < new Date()) {
        return res.status(400).json({
            success: false,
            message: "The verification code has expired. Please click 'Resend OTP' to get a fresh code."
        });
    }

    // Compare OTP
    const isOtpValid = await bcrypt.compare(otp.trim(), user.registrationOTP);
    if (!isOtpValid) {
        return res.status(400).json({
            success: false,
            message: "Invalid verification code. Please check and try again."
        });
    }

    // Activate account and clear registration OTP fields
    user.isVerified = true;
    user.registrationOTP = undefined;
    user.registrationOTPExpiry = undefined;
    await user.save({ validateBeforeSave: false });

    // Generate JWT access & refresh tokens
    const { accessToken, refreshToken } = await generateAccessandRefreshTokens(user._id);

    return res
        .cookie("accessToken", accessToken, getAuthCookieOptions(15 * 60 * 1000))
        .cookie("refreshToken", refreshToken, getAuthCookieOptions(24 * 60 * 60 * 1000))
        .status(200)
        .json({
            success: true,
            message: "Email verified successfully! Please complete your profile details.",
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

// Resends a fresh 6-digit Registration OTP to the user's email
exports.resendRegistrationOTP = asyncHandler(async (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({
            success: false,
            message: "Email is required to resend verification code"
        });
    }

    const cleanEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: cleanEmail })
        .select("+registrationOTP +registrationOTPExpiry");

    if (!user) {
        return res.status(404).json({
            success: false,
            message: "No user found with that email. Please register first."
        });
    }

    if (user.isVerified) {
        return res.status(400).json({
            success: false,
            message: "Account is already verified. Please log in directly."
        });
    }

    // Generate fresh OTP
    const otp = crypto.randomInt(100000, 999999).toString();
    user.registrationOTP = await bcrypt.hash(otp, 10);
    user.registrationOTPExpiry = new Date(Date.now() + 10 * 60 * 1000);
    await user.save({ validateBeforeSave: false });

    await sendMailHelper({
        to: user.email,
        subject: `Your New BloodLink Registration OTP: ${otp}`,
        html: `
            <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 32px 24px; background: #fff7f7; border-radius: 16px; border: 1px solid #f1c5c5;">
                <div style="text-align: center; margin-bottom: 24px;">
                    <span style="font-size: 42px;">🩸</span>
                    <h2 style="color: #b91c1c; margin: 6px 0 2px; font-size: 24px; font-weight: 800;">BloodLink</h2>
                    <p style="color: #64748b; font-size: 13px; margin: 0;">Connecting Donors & Receivers, Saving Lives</p>
                </div>
                <p style="color: #1e293b; font-size: 15px; margin: 0 0 16px;">Hello <strong>${user.fullName}</strong>,</p>
                <p style="color: #1e293b; font-size: 15px; line-height: 1.5; margin: 0 0 24px;">
                    Here is your new 6-digit verification code to complete your registration:
                </p>
                <div style="background: linear-gradient(135deg, #b91c1c 0%, #dc2626 100%); color: #fff; font-size: 32px; font-weight: 700; letter-spacing: 8px; text-align: center; padding: 16px; border-radius: 12px; margin: 0 0 24px; box-shadow: 0 4px 12px rgba(185, 28, 28, 0.25);">
                    ${otp}
                </div>
                <p style="color: #64748b; font-size: 13px; margin: 0;">This OTP is valid for <strong>10 minutes</strong>.</p>
            </div>
        `,
        otp,
        logTitle: 'Resent Registration OTP'
    });

    return res.status(200).json({
        success: true,
        message: `A fresh verification code has been sent to ${user.email}.`
    });
});

// Accepts either email OR username along with password.
// Validates credentials, checks if user exists, compares password.
// If user has not completed OTP registration verification, prompts for OTP.
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
            { email: (email || "").toLowerCase().trim() },
            { username: (username || "").toLowerCase().trim() }
        ]
    }).select("+password +refreshToken +registrationOTP +registrationOTPExpiry");

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

    // Check if user has verified their registration OTP
    if (isExistingUser.isVerified === false) {
        const otp = crypto.randomInt(100000, 999999).toString();
        isExistingUser.registrationOTP = await bcrypt.hash(otp, 10);
        isExistingUser.registrationOTPExpiry = new Date(Date.now() + 10 * 60 * 1000);
        await isExistingUser.save({ validateBeforeSave: false });

        await sendMailHelper({
            to: isExistingUser.email,
            subject: `Your BloodLink Registration OTP: ${otp}`,
            html: `
                <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 32px 24px; background: #fff7f7; border-radius: 16px; border: 1px solid #f1c5c5;">
                    <div style="text-align: center; margin-bottom: 24px;">
                        <span style="font-size: 42px;">🩸</span>
                        <h2 style="color: #b91c1c; margin: 6px 0 2px; font-size: 24px; font-weight: 800;">BloodLink</h2>
                        <p style="color: #64748b; font-size: 13px; margin: 0;">Connecting Donors & Receivers, Saving Lives</p>
                    </div>
                    <p style="color: #1e293b; font-size: 15px; margin: 0 0 16px;">Hello <strong>${isExistingUser.fullName}</strong>,</p>
                    <p style="color: #1e293b; font-size: 15px; line-height: 1.5; margin: 0 0 24px;">
                        Your account requires email verification. Please enter the 6-digit code below to complete your registration:
                    </p>
                    <div style="background: linear-gradient(135deg, #b91c1c 0%, #dc2626 100%); color: #fff; font-size: 32px; font-weight: 700; letter-spacing: 8px; text-align: center; padding: 16px; border-radius: 12px; margin: 0 0 24px; box-shadow: 0 4px 12px rgba(185, 28, 28, 0.25);">
                        ${otp}
                    </div>
                    <p style="color: #64748b; font-size: 13px; margin: 0;">This OTP is valid for <strong>10 minutes</strong>.</p>
                </div>
            `,
            otp,
            logTitle: 'Registration OTP'
        });

        return res.status(200).json({
            success: false,
            requireOtp: true,
            email: isExistingUser.email,
            role: isExistingUser.role,
            message: "Please complete your registration with the OTP sent to your email."
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
        { returnDocument: "after" }
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
// Sends the official welcome email when the user completely fills their profile details for the first time.
// Persists all updated fields directly to the MongoDB database.
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

    const wasProfileAlreadyCompleted = Boolean(user.profileCompleted);

    const validRoles = ["donor", "receiver", "hospital"];
    const targetRole =
        role && validRoles.includes(role) && user.role !== "admin" ? role : user.role;

    let updateData = {
        role: targetRole,
        profileCompleted: true,
        isVerified: true,
    };

    if (fullName && fullName.trim()) {
        updateData.fullName = fullName.trim();
    }

    // Phone number handling & duplicate prevention
    if (phoneNumber !== undefined) {
        const trimmedPhone = typeof phoneNumber === "string" ? phoneNumber.trim() : String(phoneNumber).trim();
        if (trimmedPhone) {
            const existingPhoneUser = await User.findOne({
                phoneNumber: trimmedPhone,
                _id: { $ne: req.user.id }
            });
            if (existingPhoneUser) {
                return res.status(400).json({
                    success: false,
                    message: "This phone number is already registered with another account."
                });
            }
            updateData.phoneNumber = trimmedPhone;
        } else {
            updateData.$unset = { ...(updateData.$unset || {}), phoneNumber: 1 };
        }
    }

    if (targetRole === "hospital") {
        if (hospitalName !== undefined) updateData.hospitalName = hospitalName.trim();
        if (registrationNumber !== undefined) updateData.registrationNumber = registrationNumber.trim();
        if (hospitalAddress !== undefined) updateData.hospitalAddress = hospitalAddress.trim();
        if (hospitalPhone !== undefined) updateData.hospitalPhone = hospitalPhone.trim();
    } else {
        if (bloodGroup !== undefined && bloodGroup.trim()) {
            updateData.bloodGroup = bloodGroup.trim().toUpperCase();
        }
        if (age !== undefined && age !== "") {
            updateData.age = Number(age);
        }
        if (weight !== undefined && weight !== "") {
            updateData.weight = Number(weight);
        }
        if (height !== undefined && height !== "") {
            updateData.height = Number(height);
        }
        if (diseases !== undefined) {
            updateData.diseases = Array.isArray(diseases)
                ? diseases
                : typeof diseases === "string"
                ? diseases.split(",").map((d) => d.trim()).filter(Boolean)
                : [];
        }
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

    // Persist all updates to MongoDB
    const updatedUser = await User.findByIdAndUpdate(
        req.user.id,
        updateData,
        { returnDocument: "after", runValidators: true }
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

    // If the user is completely filling their profile for the first time, send the official welcome email!
    if (!wasProfileAlreadyCompleted && updatedUser.profileCompleted) {
        const roleLabel =
            updatedUser.role === "receiver"
                ? "Receiver"
                : updatedUser.role === "hospital"
                ? "Hospital Partner"
                : "Blood Donor";

        const welcomeSubject = `Welcome to BloodLink — Thanks for registering in our website!`;
        const welcomeHtml = `
            <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 36px 28px; background: #ffffff; border-radius: 16px; border: 1px solid #fee2e2; box-shadow: 0 4px 20px rgba(0,0,0,0.05);">
                <div style="text-align: center; margin-bottom: 24px;">
                    <span style="font-size: 48px;">🩸</span>
                    <h1 style="color: #b91c1c; margin: 12px 0 4px; font-size: 26px; font-weight: 800;">Thanks for registering in our website!</h1>
                    <p style="color: #64748b; font-size: 14px; margin: 0;">Welcome to the BloodLink community</p>
                </div>
                <p style="color: #1e293b; font-size: 15px; line-height: 1.6; margin: 0 0 16px;">
                    Dear <strong>${updatedUser.fullName}</strong>,
                </p>
                <p style="color: #1e293b; font-size: 15px; line-height: 1.6; margin: 0 0 16px;">
                    Thank you for completing your profile on <strong>BloodLink</strong> as a <strong>${roleLabel}</strong>. Your profile details have been saved, and your account is now fully active!
                </p>
                <div style="background: #fef2f2; border-left: 4px solid #ef4444; padding: 16px 20px; border-radius: 8px; margin: 0 0 24px;">
                    <p style="color: #991b1b; font-size: 14px; margin: 0; line-height: 1.5; font-weight: 500;">
                        ${updatedUser.role === "receiver"
                            ? "As a receiver, you can now request blood units, track live emergency responses, and match with verified nearby donors and certified hospitals."
                            : updatedUser.role === "hospital"
                            ? "As a hospital partner, you can verify emergency requests, monitor patient requests, and manage hospital blood inventory."
                            : "As a blood donor, your willingness to donate helps save lives in critical emergencies. We will notify you whenever there are urgent requests matching your blood group in your area."}
                    </p>
                </div>
                <p style="color: #475569; font-size: 14px; line-height: 1.6; margin: 0 0 24px;">
                    You can review or update your profile details anytime from your account settings.
                </p>
                <div style="text-align: center; padding-top: 20px; border-top: 1px solid #f1f5f9;">
                    <p style="color: #94a3b8; font-size: 12px; margin: 0;">BloodLink · Real-time Blood Donation & Hospital Network</p>
                </div>
            </div>
        `;

        sendMailHelper({
            to: updatedUser.email,
            subject: welcomeSubject,
            html: welcomeHtml,
            logTitle: "Welcome Profile Email"
        }).catch((err) => console.warn("Welcome email dispatch notice:", err.message));
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
    await sendMailHelper({
        to: user.email,
        subject: 'Password Reset OTP — BloodLink',
        html: `
            <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; background: #fff7f7; border-radius: 16px; border: 1px solid #f1c5c5;">
                <h2 style="color: #b91c1c; margin: 0 0 8px;">🩸 BloodLink</h2>
                <p style="color: #1e293b; font-size: 15px; margin: 0 0 24px;">We received a request to reset your password. Use the OTP below:</p>
                <div style="background: #b91c1c; color: #fff; font-size: 32px; font-weight: 700; letter-spacing: 8px; text-align: center; padding: 16px; border-radius: 12px; margin: 0 0 24px;">
                    ${otp}
                </div>
                <p style="color: #64748b; font-size: 13px; margin: 0;">This OTP expires in <strong>10 minutes</strong>. If you did not request this, please ignore this email.</p>
            </div>
        `,
        otp,
        logTitle: 'Password Reset OTP'
    });

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

// ─── Diagnostic Mail Test Endpoint ───────────────────────────────────────────
exports.testEmailDelivery = asyncHandler(async (req, res) => {
    const to = req.query.to || req.body.to || process.env.SMTP_FROM || 'bloodlink.supprot1@gmail.com';
    const result = await sendMailHelper({
        to,
        subject: "BloodLink SMTP Diagnostic Test",
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 500px; padding: 24px; border: 1px solid #f1c5c5; border-radius: 12px; background: #fff7f7;">
                <h2 style="color: #b91c1c; margin-top: 0;">🩸 BloodLink SMTP Diagnostic Test</h2>
                <p style="color: #1e293b; font-size: 15px;">Congratulations! If you are reading this email in your inbox, your SMTP email delivery is <strong>100% operational</strong>!</p>
                <p style="color: #64748b; font-size: 13px;">Sent at: ${new Date().toLocaleString()}</p>
                <p style="color: #64748b; font-size: 13px;">Host: ${process.env.SMTP_HOST || 'Gmail Service'}</p>
            </div>
        `,
        text: "Congratulations! Your BloodLink SMTP email delivery is operational!",
        logTitle: "Diagnostic Test"
    });

    if (result.delivered) {
        return res.status(200).json({
            success: true,
            delivered: true,
            message: `Email successfully delivered to ${to}. Please check your Gmail Inbox (and Spam folder).`,
            messageId: result.messageId
        });
    } else {
        return res.status(500).json({
            success: false,
            delivered: false,
            message: `Failed to deliver email to ${to}.`,
            error: result.error,
            fallback: result.fallback,
            details: result.details
        });
    }
});