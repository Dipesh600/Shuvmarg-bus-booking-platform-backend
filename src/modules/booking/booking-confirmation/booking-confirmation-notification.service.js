'use strict';

const {
  createLocalNotification: prodCreateLocalNotification,
  notificationManager: prodNotificationManager,
} = require('../../../../controllers/notificationController/notification_manager.js');
const UserDeviceInfo = require('../../../../models/userDeviceInfoModel.js');

function createBookingConfirmationNotifier({
  createLocalNotification,
  sendPushNotification,
  findUserDevices,
}) {
  return async function sendBookingConfirmedNotification({
    userId,
    ticketId,
    metadata,
  }) {
    await createLocalNotification(
      userId,
      'BOOKING_CONFIRMED',
      'Ticket Booked Successfully',
      `Your ticket (${ticketId}) is confirmed.`,
      metadata
    );

    const devices = await findUserDevices(userId);
    const tokens = devices
      .map((device) => device.token)
      .filter(Boolean);

    if (tokens.length > 0) {
      await sendPushNotification(
        tokens,
        'Ticket Booked Successfully',
        `Your ticket (${ticketId}) is confirmed.`
      );
    }
  };
}

const sendBookingConfirmedNotification = createBookingConfirmationNotifier({
  createLocalNotification: prodCreateLocalNotification,
  sendPushNotification: prodNotificationManager,
  findUserDevices: (userId) => UserDeviceInfo.find({ userId }),
});

module.exports = {
  createBookingConfirmationNotifier,
  sendBookingConfirmedNotification,
};
