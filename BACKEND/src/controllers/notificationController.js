//notificationController.js
const Notification = require("../model/notificationModel");
const asyncHandler = require("express-async-handler");

exports.viewNotifications = asyncHandler(async (req, res) => {
    const notifications = await Notification.find({
        recipientId: req.user.id,
    })
        .populate("relatedUser", "fullName")
        .populate("relatedRequest", "bloodGroup quantity")
        .populate("relatedDonation", "status")
        .sort({ createdAt: -1 });

    res.status(200).json({
        success: true,
        count: notifications.length,
        notifications: notifications.map((n) => ({
            id: n._id,
            message: n.message,
            type: n.type,
            status: n.status,
            relatedRequest: n.relatedRequest,
            relatedDonation: n.relatedDonation,
            relatedUser: n.relatedUser,
            createdAt: n.createdAt,
        })),
    });
});

exports.markAsRead = asyncHandler(async (req, res) => {
    const { notificationId } = req.params;

    const notification = await Notification.findByIdAndUpdate(
        notificationId,
        { status: "read" },
        { new: true }
    );

    if (!notification) {
        return res.status(404).json({
            success: false,
            message: "Notification not found",
        });
    }

    res.status(200).json({
        success: true,
        message: "Notification marked as read",
        notification,
    });
});

exports.markAllAsRead = asyncHandler(async (req, res) => {
    await Notification.updateMany(
        { recipientId: req.user.id, status: { $ne: "read" } },
        { status: "read" }
    );

    res.status(200).json({
        success: true,
        message: "All notifications marked as read",
    });
});

exports.deleteNotification = asyncHandler(async (req, res) => {
    const { notificationId } = req.params;

    const notification = await Notification.findByIdAndDelete(notificationId);

    if (!notification) {
        return res.status(404).json({
            success: false,
            message: "Notification not found",
        });
    }

    res.status(200).json({
        success: true,
        message: "Notification deleted",
    });
});

exports.getUnreadCount = asyncHandler(async (req, res) => {
    const unreadCount = await Notification.countDocuments({
        recipientId: req.user.id,
        status: { $ne: "read" },
    });

    res.status(200).json({
        success: true,
        unreadCount,
    });
});