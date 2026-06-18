//external imports
const express = require('express');
const userRouter = express.Router();
//internal imports
const userController = require('../controllers/userController');
const authMiddleware = require('../middlewares/authMiddleware');

userRouter.post('/auth/register',userController.userRegister);  
userRouter.post('/auth/login',userController.userLogin);
userRouter.post('/auth/logout',authMiddleware,userController.userLogout)
userRouter.post('/auth/refresh-tokens',userController.refreshAccessToken)

userRouter.get('/user/profile',authMiddleware,userController.userProfileDetails)
userRouter.post('/user/update-profile',authMiddleware,userController.userUpdateProfile)
userRouter.post('/user/check-profileStatus',
    authMiddleware,
    userController.checkProfileCompletion
);

module.exports=userRouter