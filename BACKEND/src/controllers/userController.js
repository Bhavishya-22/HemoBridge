const asyncHandler = require('express-async-handler');
const bcrypt = require('bcryptjs'); 
const User = require('../model/userModel');
const jwt=require("jsonwebtoken")



const generateAccessandRefreshTokens=asyncHandler(async(userId)=>{
    //here we declared it seperartely beacause it may be reusable and it is used to generate access and refresh tokens 
    try {
        const user=await User.findById(userId);
        const accessToken=await user.generateAccessToken();
        const refreshToken=await user.generateRefreshToken();
        user.refreshToken=refreshToken;
        await user.save({validateBeforeSave:false})//no need to validate again because if .save() is runned then we need to give password also so if we keep ValidateBeforeSave:false then no neeed to give pass
        return {accessToken,refreshToken};
    } catch (error) {
        return res.status(500).json({message:"we couldnot generate the tokens its our issue"});
    }
})

exports.userRegister = asyncHandler(async (req, res) => {
    //collect user data from request body
    //add validation and hashing logic here
    //check if user already exists in the database,if yes return an error response
    //if not, create a new user in the database
    //send a success response like this which is in the code , this is the payload to the frontend(which is collected via req.body)
    //console.log(req.body)
    const { username, fullName, email, password} = req.body;
    if ( !email && !username) {
        return res.status(400).json({ message: "All fields are required" });
    }
    const existingUser = await User.findOne({ email });
    if (existingUser) {
        return res.status(400).json({ message: "User already exists" });
    }
   
    const newUser = await User.create({
        username,
        fullName,
        email,
        password, 
    });

    res.status(201).json({
        message: "User registered successfully",
        user: {
            id: newUser._id,
            username: newUser.username,
            email: newUser.email,
            avatar: newUser.avatar,
            coverImage: newUser.coverImage
        }
    });
})

exports.userLogin = asyncHandler(async (req, res) => {
    // Collect info from req.body (accepting either email OR username via 'identifier')
    const { identifier, password } = req.body;
    if (!identifier || !password) {
        return res.status(400).json({
            message: "Username/Email and password are required"
        });
    }
    // Search for a user where either the email OR the username matches the identifier
    const isExistingUser = await User.findOne({
        $or: [
            { email: identifier.toLowerCase() }, // Good practice to normalize case
            { username: identifier }
        ]
    });

    if (!isExistingUser) {
        return res.status(404).json({
            message: "User not found"
        });
    }

    const isPasswordCorrect = await isExistingUser.comparePassword(password);

    if (!isPasswordCorrect) {
        return res.status(401).json({
            message: "Invalid credentials"
        });
    }

    const { accessToken, refreshToken } = await generateAccessandRefreshTokens(isExistingUser._id);

    res
    .cookie("accessToken", accessToken, {
        httpOnly: true,
        secure: false,
        sameSite: "strict",
        maxAge: 60 * 1000 // 1 minute
    })
    .cookie("refreshToken", refreshToken, {
        httpOnly: true,
        secure: false,
        sameSite: "strict",
        maxAge: 24 * 60 * 60 * 1000 // 1 day
    })
    .json({
        message: "Login successful",
        user: {
            id: isExistingUser._id,
            username: isExistingUser.username,
            email: isExistingUser.email,
            fullName: isExistingUser.fullName,
            profileCompleted: isExistingUser.profileCompleted
        }
    });
});

exports.checkProfileCompletion =asyncHandler(async (req, res) => {
//usefull for frontend
    const user = await User.findById(req.userFromMiddleware.id);

     res.status(200).json({
        profileCompleted:
            user.profileCompleted,
        nextPage:
            user.profileCompleted
                ? "/home"
                : "/profile"
    });
});

exports.userLogout = asyncHandler(async (req, res) => {

    await User.findByIdAndUpdate(
        req.userFromMiddleware.id,
        {$unset: {refreshToken: 1}},
        {new:true}
    );

   res.status(200)
    .clearCookie("accessToken",{//un-declaring cookie
        httpOnly: true,
        secure: false,
        sameSite: "strict",
        path:'/'
    })
    .clearCookie("refreshToken",{
        httpOnly: true,
        secure: false,
        sameSite: "strict",
        path:'/'
    })
        .json({
            message: "Logout successful",
            user:{
            id:req.userFromMiddleware.id,
            email:req.userFromMiddleware.email,
            fullName:req.userFromMiddleware.fullName,
            username:req.userFromMiddleware.username
        }
        });
});

exports.refreshAccessToken = asyncHandler(async (req, res) => {
    //basically comparision
    //The refreshAccessToken endpoint is the mechanism that: Verifies the refresh token is valid and matches what’s in the database. Issues a new access token (and usually rotates the refresh token). Sends them back to the client so the user stays logged in without re‑entering credentials.
    console.log("old",req.cookies.refreshToken);
  const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken;
  if (!incomingRefreshToken) {
    return res.status(401).json({ message: "No refresh token provided" });
  }
  try {
    const decoded = jwt.verify(incomingRefreshToken, process.env.JWT_REFRESH_SECRET);
    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }
    // Compare incoming token with stored one
    if (incomingRefreshToken !== user.refreshToken) {
      return res.status(401).json({ message: "Refresh token is invalid or has been rotated" });
    }

    // Generate new tokens
    const {accessToken,refreshToken:newRefreshToken}=await generateAccessandRefreshTokens(user._id)
    console.log("new",newRefreshToken);
    res
      .cookie("accessToken", accessToken, { httpOnly: true, secure: true, sameSite: "strict"})
      .cookie("refreshToken", newRefreshToken, { httpOnly: true, secure: true, sameSite: "strict" })
      .status(200)
      .json({ message: "Access token refreshed successfully" });

  } catch (error) {
    return res.status(401).json({ message: "Refresh token expired or invalid" });
  }
});

exports.userUpdateProfile =asyncHandler(async (req, res) => {
    const {phoneNumber,bloodGroup,age,weight,diseases,location,role} = req.body;
    const updatedUser =await User.findByIdAndUpdate(req.userFromMiddleware.id,
            {
                phoneNumber,bloodGroup,age,weight,diseases,location,role,profileCompleted: true
            },
            {
                new: true
            }
        ).select(
            "-password -refreshToken"
        );

    res.status(200).json({
        message:
            "Profile updated successfully",
        user: updatedUser
    });
});

exports.userProfileDetails =asyncHandler(async (req, res) => {

    const user = await User.findById(req.userFromMiddleware.id).select("-password -refreshToken");

    if (!user) {
        return res.status(404).json({message: "User not found"});
    }
    res.status(200).json({message:"user profile",user});
});