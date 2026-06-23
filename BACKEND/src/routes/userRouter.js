const express = require('express');
const userRouter = express.Router();
const userController = require('../controllers/userController');
const authMiddleware = require('../middlewares/authMiddleware');

// Authentication routes
userRouter.post('/auth/check-admin-email', userController.checkAdminEmail);
userRouter.post('/auth/register', userController.userRegister);  
userRouter.post('/auth/login', userController.userLogin);
userRouter.post('/auth/logout', authMiddleware, userController.userLogout);
userRouter.post('/auth/refresh-tokens', userController.refreshAccessToken);

// Profile routes
userRouter.get('/user/profile', authMiddleware, userController.userProfileDetails);
userRouter.post('/user/update-profile', authMiddleware, userController.userUpdateProfile);
userRouter.post('/user/check-profileStatus', authMiddleware, userController.checkProfileCompletion);
userRouter.get('/user/hospital-status', authMiddleware, userController.getHospitalRegistrationStatus);

module.exports = userRouter;