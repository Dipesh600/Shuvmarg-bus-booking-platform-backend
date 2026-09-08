const verifyRoleFromDB = require("../../middleware/verifyRoleFromDB.js");
const express = require("express");
const router = express.Router();
const noticontroller = require("../../controllers/notificationController/notificationController.js");
const adminAuth = require("../../middleware/adminMiddleware.js");
const auth = require("../../middleware/authMiddleware.js");


router.post("/getDeviceInfo", auth, verifyRoleFromDB, noticontroller.getDeviceInfo);
// Broadcast reaches all devices and requires the separate administrator identity.
router.post("/notifyUser", adminAuth, noticontroller.notifyUsers);

// Get only the current user's local notifications
router.get(
  "/my-local-notifications",
  auth,
  verifyRoleFromDB,
  noticontroller.getMyLocalNotifications
);

router.patch(
  "/markNotificationAsRead/:notificationId",
  auth,
  verifyRoleFromDB,
  noticontroller.markNotificationAsRead
);

router.delete(
  "/delete/:notificationId",
  auth,
  verifyRoleFromDB,
  noticontroller.deleteNotification
);

module.exports = router;
