const UserDeviceInfo = require("../../models/userDeviceInfoModel.js");
const LocalNotification = require("../../models/localNotificationModel.js");
const {
  notificationManager,
} = require("../notificationController/notification_manager.js");
const getDeviceInfo = async (req, res) => {
  try {
    const { token, userType, os, osVersion, deviceModel } = req.body;
    const userId = req.userInfo?.id;

    if (!userId) {
      return res.status(400).json({
        status: false,
        message: "Please provide userId!",
      });
    }

    const newDeviceInfo = {
      userId,
      token,
      userType,
      os,
      osVersion,
      deviceModel,
    };

    const existingDevice = await UserDeviceInfo.findOne({ userId });

    if (existingDevice) {
      await UserDeviceInfo.updateOne({ userId }, newDeviceInfo);
    } else {
      await UserDeviceInfo.create(newDeviceInfo);
    }

    return res.status(200).json({
      status: true,
      message: "Device info saved/updated successfully!",
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({
      status: false,
      message: "Failed to save device info!",
    });
  }
};
// Send notification to user

const notifyUsers = async (req, res) => {
  try {
    const { title, body } = req.body;
    const devices = await UserDeviceInfo.find({});
    console.log("list of token ", devices);
    const tokens = devices
      .map((device) => device.token)
      .filter((token) => !!token);
    console.log("my tokens", tokens);
    if (tokens.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No valid tokens found",
      });
    }

    // const title = 'Hello Sumarg Users';
    // const body = 'Good Evening!';

    const result = await notificationManager(tokens, title, body);

    if (result.success) {
      return res.status(200).json(result);
    } else {
      return res.status(500).json(result);
    }
  } catch (error) {
    console.error("Notification error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while sending notifications",
      error,
    });
  }
};
// Get local notifications for the current user
const getMyLocalNotifications = async (req, res) => {
  try {
    const userId = req.userInfo?.id;
    if (!userId) {
      return res.status(400).json({
        status: false,
        message: "Please provide userId!",
      });
    }
    const notifications = await LocalNotification.find({ user: userId }).sort({
      createdAt: -1,
    });
    return res.status(200).json({
      status: true,
      notifications,
    });
  } catch (error) {
    console.error("Error fetching local notifications:", error);
    return res.status(500).json({
      status: false,
      message: "Failed to fetch local notifications!",
      error,
    });
  }
};

// Mark notification as read
const markNotificationAsRead = async (req, res) => {
  try {
    const { notificationId } = req.params;
    const userId = req.userInfo?.id;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "Please provide userId!",
      });
    }

    if (!notificationId) {
      return res.status(400).json({
        success: false,
        message: "Please provide notification ID!",
      });
    }

    // Find and update the notification, ensuring it belongs to the current user
    const notification = await LocalNotification.findOneAndUpdate(
      { _id: notificationId, user: userId },
      { isRead: true },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({
        success: false,
        message:
          "Notification not found or you don't have permission to update it!",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Notification marked as read successfully!",
      notification,
    });
  } catch (error) {
    console.error("Error marking notification as read:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to mark notification as read!",
      error,
    });
  }
};
// Delete notification
const deleteNotification = async (req, res) => {
  try {
    const { notificationId } = req.params;
    const userId = req.userInfo?.id;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "Please provide userId!",
      });
    }

    if (!notificationId) {
      return res.status(400).json({
        success: false,
        message: "Please provide notification ID!",
      });
    }

    const notification = await LocalNotification.findOneAndDelete({
      _id: notificationId,
      user: userId,
    });

    if (!notification) {
      return res.status(404).json({
        success: false,
        message:
          "Notification not found or you don't have permission to delete it!",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Notification deleted successfully!",
    });
  } catch (error) {
    console.error("Error deleting notification:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete notification!",
      error,
    });
  }
};

module.exports = {
  getDeviceInfo,
  notifyUsers,
  getMyLocalNotifications,
  markNotificationAsRead,
  deleteNotification
};
