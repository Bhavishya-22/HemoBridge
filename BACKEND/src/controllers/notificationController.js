const Notification = require("../model/notificationModel");

exports.viewNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find({
      recipientId: req.user.id,
    }).sort({ createdAt: -1 });
    
    console.log(notifications)
    res.status(200).json({
      success: true,
      count: notifications.length,
      notifications: notifications.map((n) => ({
        id: n._id,
        message: n.message,
        type: n.type,
        status: n.status,
        createdAt: n.createdAt,
      })),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};