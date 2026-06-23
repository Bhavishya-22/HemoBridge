const express = require("express");
const notificationController = require("../controllers/notificationController");
const authMiddleware = require("../middlewares/authMiddleware");

const notificationRouter = express.Router();

// Get all notifications
notificationRouter.get("/notifications/view",authMiddleware,notificationController.viewNotifications);

// Get unread count
notificationRouter.get("/notifications/unread-count",authMiddleware,notificationController.getUnreadCount);

// Mark single notification as read
notificationRouter.patch("/notifications/:notificationId/read",authMiddleware,notificationController.markAsRead);

// Mark all notifications as read
notificationRouter.patch("/notifications/mark-all-read",authMiddleware,notificationController.markAllAsRead);

// Delete notification
notificationRouter.delete("/notifications/:notificationId",authMiddleware,notificationController.deleteNotification);

module.exports = notificationRouter;