const express = require('express');
const userRouter = express.Router();
const userController = require('../controllers/userController');
const authMiddleware = require('../middlewares/authMiddleware');

// Authentication routes
userRouter.post('/auth/register', userController.userRegister);  
userRouter.post('/auth/verify-registration-otp', userController.verifyRegistrationOTP);
userRouter.post('/auth/resend-registration-otp', userController.resendRegistrationOTP);
userRouter.post('/auth/login', userController.userLogin);
userRouter.post('/auth/google', userController.googleLogin);
userRouter.get('/auth/google-client-id', userController.getGoogleClientId);
userRouter.post('/auth/forgot-password', userController.forgotPassword);
userRouter.post('/auth/reset-password', userController.resetPassword);
userRouter.post('/auth/logout', authMiddleware, userController.userLogout);
userRouter.post('/auth/refresh-tokens', userController.refreshAccessToken);
userRouter.get('/auth/test-email', userController.testEmailDelivery);
userRouter.post('/auth/test-email', userController.testEmailDelivery);

// Profile routes
userRouter.get('/user/profile', authMiddleware, userController.userProfileDetails);
userRouter.post('/user/update-profile', authMiddleware, userController.userUpdateProfile);
userRouter.post('/user/check-profileStatus', authMiddleware, userController.checkProfileCompletion);
userRouter.get('/user/hospital-status', authMiddleware, userController.getHospitalRegistrationStatus);

module.exports = userRouter;