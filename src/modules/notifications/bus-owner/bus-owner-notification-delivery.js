'use strict';

function createNotificationDelivery({
  UserDeviceInfo,
  emailManager,
  notificationManager,
  createLocalNotification,
  sendOTP,
  logger,
  notificationOutbox,
}) {
  const outbox = notificationOutbox || require('../outbox');

  const sendEmail = async (email, subject, htmlContent, context) => {
    if (!email) return;
    try {
      await emailManager(email, subject, htmlContent);
    } catch (error) {
      logger.warn(`[busOwnerNotificationService] Email notification failed for ${context}:`, error.message);
    }
  };

  const sendSms = async (phone, message, context, deliveryContext = {}) => {
    if (!phone) return 'NOT_REQUIRED';
    try {
      const result = await outbox.dispatchSms({
        messageType: deliveryContext.messageType,
        idempotencyKey: deliveryContext.idempotencyKey,
        businessReference: deliveryContext.businessReference,
        recipientPhone: phone,
        body: message,
        userId: deliveryContext.userId || null,
        ownerId: deliveryContext.ownerId || null,
        brandId: deliveryContext.brandId || null,
        expiresAt: deliveryContext.expiresAt || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      }, { send: sendOTP });
      return result?.status || 'PENDING';
    } catch (error) {
      logger.warn(`[busOwnerNotificationService] SMS notification failed for ${context}:`, error.message);
      return 'FAILED';
    }
  };

  const sendPushAndLocal = async (userId, title, body, meta, context) => {
    try {
      await createLocalNotification(userId, context, title, body, meta, 'busOwner');
      const devices = await UserDeviceInfo.find({ userId });
      const tokens = devices.map((device) => device.token).filter(Boolean);
      if (tokens.length > 0) await notificationManager(tokens, title, body);
    } catch (error) {
      logger.error(`[busOwnerNotificationService] Push Notification Error for ${context}:`, error);
    }
  };

  return { sendEmail, sendPushAndLocal, sendSms };
}

module.exports = { createNotificationDelivery };
