"use strict";

const UserDeviceInfo = require("../../../../models/userDeviceInfoModel");
const emailManager = require("../../../../emailManager/emailManager");
const sendOTP = require("../../../../handlers/sparro-otp");
const generateStatusEmail = require("../../../../handlers/busOwnerStatusEmailTemp");
const {
  notificationManager,
  createLocalNotification,
} = require("../../../../controllers/notificationController/notification_manager");
const fleetStatusPolicy = require("../../admin/fleet-management/fleet-status.policy");
const notificationOutbox = require("../outbox");
const { createBusOwnerNotificationService } = require("./bus-owner-notification.service");

// Create a singleton instance of the service
const busOwnerNotificationService = createBusOwnerNotificationService({
  UserDeviceInfo,
  emailManager,
  notificationManager,
  createLocalNotification,
  sendOTP,
  generateStatusEmail,
  policy: fleetStatusPolicy,
  logger: console,
  notificationOutbox,
});

module.exports = {
  busOwnerNotificationService,
};
