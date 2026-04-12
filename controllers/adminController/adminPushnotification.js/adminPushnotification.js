const mongoose = require("mongoose");
const UserDeviceInfo = require("../../../models/userDeviceInfoModel.js");
const {
    notificationManager,
    createLocalNotification,
} = require("../../notificationController/notification_manager.js");

const sendAllUserToPushnotification = async (req, res) => {
    try {
        const { title, description } = req.body;

        if (!title || !description) {
            return res.status(400).json({
                success: false,
                message: "Please provide title and description!",
            });
        }

        const devices = await UserDeviceInfo.find({});
        const tokens = devices.map((d) => d.token).filter(Boolean);

        if (tokens.length === 0) {
            return res.status(404).json({
                success: false,
                message: "No valid tokens found",
            });
        }

        const uniqueUserIds = [
            ...new Set(devices.map((d) => (d.userId ? d.userId.toString() : null)).filter(Boolean)),
        ];

        try {
            await Promise.all(
                uniqueUserIds.map((userId) =>
                    createLocalNotification(userId, "ADMIN_BROADCAST", title, description, {})
                )
            );
        } catch (localError) {
            console.error("Error creating local notifications:", localError);
        }

        const result = await notificationManager(tokens, title, description);

        if (result.success) {
            return res.status(200).json({
                success: true,
                message: "Push notification sent to all users successfully!",
                // result,
            });
        }

        return res.status(500).json({
            success: false,
            message: "Failed to send push notification to all users!",
            // result,
        });
    } catch (error) {
        console.error("sendAllUserToPushnotification error:", error);
        return res.status(500).json({
            success: false,
            message: "Internal Server Error!",
        });
    }
};

const sendSingleUserToPushnotification = async (req, res) => {
    try {
        const { userId, title, description } = req.body;

        if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({
                success: false,
                message: "Please provide a valid userId!",
            });
        }

        if (!title || !description) {
            return res.status(400).json({
                success: false,
                message: "Please provide title and description!",
            });
        }

        const devices = await UserDeviceInfo.find({ userId });
        const tokens = devices.map((d) => d.token).filter(Boolean);

        if (tokens.length === 0) {
            return res.status(404).json({
                success: false,
                message: "No valid tokens found for this user",
            });
        }

        try {
            await createLocalNotification(userId, "ADMIN_SINGLE_PUSH", title, description, {});
        } catch (localError) {
            console.error("Error creating local notification:", localError);
        }

        const result = await notificationManager(tokens, title, description);

        if (result.success) {
            return res.status(200).json({
                success: true,
                message: "Push notification sent to user successfully!",
                // result,
            });
        }

        return res.status(500).json({
            success: false,
            message: "Failed to send push notification to this user!",
            // result,
        });
    } catch (error) {
        console.error("sendSingleUserToPushnotification error:", error);
        return res.status(500).json({
            success: false,
            message: "Internal Server Error!",
        });
    }
};

module.exports = {
    sendAllUserToPushnotification,
    sendSingleUserToPushnotification,
};