const express = require("express");
const router = express.Router();
const noticontroller = require("../../controllers/notificationController/notificationController.js");
const role = require("../../middleware/checkRole.js");
const auth = require("../../middleware/authMiddleware.js");


router.post("/getDeviceInfo", auth, noticontroller.getDeviceInfo);
router.post("/notifyUser", auth, noticontroller.notifyUsers);

// Get only the current user's local notifications
router.get(
  "/my-local-notifications",
  auth,
  noticontroller.getMyLocalNotifications
);

router.patch(
  "/markNotificationAsRead/:notificationId",
  auth,
  noticontroller.markNotificationAsRead
);

router.delete(
  "/delete/:notificationId",
  auth,
  noticontroller.deleteNotification
);

module.exports = router;
