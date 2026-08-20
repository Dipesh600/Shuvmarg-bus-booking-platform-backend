const { cert, getApps, initializeApp } = require("firebase-admin/app");
const { getMessaging } = require("firebase-admin/messaging");
const Notification = require("../../models/localNotificationModel.js");

// Load Firebase credentials from environment variables (production-safe).
// Set these on Render: FCM_PROJECT_ID, FCM_CLIENT_EMAIL, FCM_PRIVATE_KEY
const fcmProjectId   = process.env.FCM_PROJECT_ID;
const fcmClientEmail = process.env.FCM_CLIENT_EMAIL;
// Render escapes newlines in env vars — restore them here
const fcmPrivateKey  = process.env.FCM_PRIVATE_KEY
  ? process.env.FCM_PRIVATE_KEY.replace(/\\n/g, "\n")
  : undefined;

let fcmInitialized = false;
let firebaseApp;

if (getApps().length > 0) {
  [firebaseApp] = getApps();
  fcmInitialized = true;
} else {
  if (fcmProjectId && fcmClientEmail && fcmPrivateKey) {
    try {
      firebaseApp = initializeApp({
        credential: cert({
          type:         "service_account",
          project_id:   fcmProjectId,
          client_email: fcmClientEmail,
          private_key:  fcmPrivateKey,
        }),
      });
      fcmInitialized = true;
    } catch (err) {
      console.warn("[FCM] Firebase init failed:", err.message);
    }
  } else {
    console.warn("[FCM] Firebase env vars not set — push notifications disabled.");
  }
}

const notificationManager = async (tokens, title, body) => {
  if (!fcmInitialized) {
    console.warn("[FCM] Push notification skipped — Firebase not initialized.");
    return { success: false, error: "Firebase not configured" };
  }
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
    const response = await getMessaging(firebaseApp).sendEachForMulticast(message);
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
  meta = {},
  recipientRole = "all"
) => {
  try {
    const notification = await Notification.create({
      user: userId,
      type,
      title,
      message,
      meta,
      recipientRole,
    });
    return notification;
  } catch (error) {
    console.error("Error creating local notification:", error);
    throw error;
  }
};

module.exports = { notificationManager, createLocalNotification };
