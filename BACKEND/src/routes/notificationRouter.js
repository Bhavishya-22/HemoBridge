const express = require("express");

const notificationController =require("../controllers/notificationController");
const authMiddleware =require("../middlewares/authMiddleware");

const notificationRouter =express.Router();

notificationRouter.get("/notifications/view",authMiddleware,notificationController.viewNotifications);

module.exports =notificationRouter;