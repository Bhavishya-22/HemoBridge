//authMiddleware
const asyncHandler = require('express-async-handler')
const User=require('../model/userModel')
const jwt=require('jsonwebtoken')

//this is created for the purpose of not having the user data while loggingout so if we need data whithout iput fields not only for logout the data contains the payload sent via generateAccessToken() methodwe use req.user 

const verifyTokens=asyncHandler(async(req,res,next)=>{
    // console.log("entered to the middleware")
    try {
        const accesstoken=req.cookies?.accessToken || req.header("Authorization")?.replace("Bearer ","")
        // console.log("accesstoken:",accesstoken)
        if(!accesstoken){
            return res.status(404).json({message:"no token attached"})
        }
        const decodedUser=jwt.verify(accesstoken,process.env.JWT_ACCESS_SECRET)//this decoded is the user obj which contains payload as  { id: this._id, email: this.email, username: this.username ,fullName: this.fullName}, whihc is in generateAccessToken 
        if(!decodedUser){
             return res.status(404).json({message:"no user found"});
         }
        req.user=decodedUser;//sending this as payload 
        next();
    } catch (error) {
        console.error(error)
        return res.status(401).json({message:"unauthorized access"})
    }
})
module.exports=verifyTokens