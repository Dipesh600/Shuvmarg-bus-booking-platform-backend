const admin = require("firebase-admin");
const serviceAccount = require("../../config/fcm_config.json");
const Notification = require("../../models/localNotificationModel.js");

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const notificationManager = async (tokens, title, body) => {
  if (!Array.isArray(tokens) || tokens.length === 0) {
    return { success: false, error: "No tokens provided" };
  }

  const message = {
    notification: {
      title: title,
      body: body,
    },
    tokens: tokens,
  };

  try {
    const response = await admin.messaging().sendEachForMulticast(message);
    console.log("Successfully sent message:", response);
    return { success: true, response };
  } catch (error) {
    console.error("Error sending message:", error);
    return { success: false, error };
  }
};

const createLocalNotification = async (
  userId,
  type,
  title,
  message,
  meta = {}
) => {
  try {
    const notification = await Notification.create({
      user: userId,
      type,
      title,
      message,
      meta,
    });
    return notification;
  } catch (error) {
    console.error("Error creating local notification:", error);
    throw error;
  }
};

module.exports = { notificationManager, createLocalNotification };
