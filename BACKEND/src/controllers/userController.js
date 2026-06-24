//userController.js
const asyncHandler = require('express-async-handler');
const bcrypt = require('bcryptjs'); 
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
    if (!email || !username || !fullName || !password || !role) {
        return res.status(400).json({ 
            success: false,
            message: "All fields are required" 
        });
    }

    // Validate role
    const validRoles = ["donor", "receiver", "hospital","admin"];
    if (!validRoles.includes(role)) {
        return res.status(400).json({ 
            success: false,
            message: "Invalid role selected" 
        });
    }


    // Check if user already exists
    const existingUser = await User.findOne({ 
        $or: [{ email }, { username }]
    });

    if (existingUser) {
        return res.status(400).json({ 
            success: false,
            message: "User with this email or username already exists" 
        });
    }

    // Create new user
    const newUser = await User.create({
        username,
        fullName,
        email,
        password,
        role
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
        .cookie("accessToken", accessToken, {
            httpOnly: true,
            secure: false,
            sameSite: "strict",
            maxAge: 15 * 60 * 1000
        })
        .cookie("refreshToken", refreshToken, {
            httpOnly: true,
            secure: false,
            sameSite: "strict",
            maxAge: 24 * 60 * 60 * 1000
        })
        .json({
            success: true,
            message: "Login successful",
            user: {
                id: isExistingUser._id,
                username: isExistingUser.username,
                email: isExistingUser.email,
                fullName: isExistingUser.fullName,
                role: isExistingUser.role,
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
        .clearCookie("accessToken", {
            httpOnly: true,
            secure: false,
            sameSite: "strict",
            path: '/'
        })
        .clearCookie("refreshToken", {
            httpOnly: true,
            secure: false,
            sameSite: "strict",
            path: '/'
        })
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
            .cookie("accessToken", accessToken, { 
                httpOnly: true, 
                secure: false, 
                sameSite: "strict",
                maxAge: 15 * 60 * 1000
            })
            .cookie("refreshToken", newRefreshToken, { 
                httpOnly: true, 
                secure: false, 
                sameSite: "strict",
                maxAge: 24 * 60 * 60 * 1000
            })
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

// Updates user profile fields and marks profile as completed.
// Excludes password and refreshToken from response.
exports.userUpdateProfile = asyncHandler(async (req, res) => {
    const { phoneNumber, bloodGroup, age, weight, diseases, location } = req.body;

    const user = await User.findById(req.user.id);

    // Build update object safely
    const updateData = {
        phoneNumber,
        bloodGroup,
        age,
        weight,
        diseases,
        profileCompleted: true
    };

    // ✅ ONLY update location if valid GeoJSON exists
    if (
        location &&
        location.coordinates &&
        Array.isArray(location.coordinates.coordinates) &&
        location.coordinates.coordinates.length === 2
    ) {
        updateData.location = {
            city: location.city || "",
            state: location.state || "",
            coordinates: {
                type: "Point",
                coordinates: location.coordinates.coordinates
            }
        };
    }

    const updatedUser = await User.findByIdAndUpdate(
        req.user.id,
        updateData,
        { new: true }
    ).select("-password -refreshToken");

    res.status(200).json({
        success: true,
        message: "Profile updated successfully",
        user: updatedUser
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