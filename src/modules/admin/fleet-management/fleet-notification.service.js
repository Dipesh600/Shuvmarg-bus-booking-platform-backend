"use strict";

function createFleetNotificationService({
  UserDeviceInfo,
  emailManager,
  notificationManager,
  createLocalNotification,
  sendOTP,
  console,
  policy,
}) {
  async function sendEmail(owner, bus, message) {
    if (!owner.email) return;
    const html = `
                    <p>Dear ${owner.name},</p>
                    <p>${message.body}</p>
                    <p><strong>Bus Details:</strong></p>
                    <ul>
                        <li>Bus Name: ${bus.busName}</li>
                        <li>Bus Number: ${bus.busNumber}</li>
                    </ul>
                    <p>Thank you.</p>
                `;
    await emailManager(
      owner.email,
      `Fleet Status Update - ${bus.busNumber}`,
      html
    );
  }

  async function sendPush(owner, bus, status, message) {
    try {
      const devices = await UserDeviceInfo.find({ userId: owner._id });
      const tokens = devices.map((device) => device.token).filter(Boolean);
      if (tokens.length > 0) {
        await notificationManager(tokens, message.title, message.body);
      }
      await createLocalNotification(
        owner._id,
        "FLEET_STATUS_UPDATE",
        message.title,
        message.body,
        { fleetId: bus._id, status }
      );
    } catch (error) {
      console.error("Push Notification Error:", error);
    }
  }

  async function sendSms(owner, message) {
    if (!owner.contactNumber) return;
    try {
      await sendOTP(
        owner.contactNumber,
        `${message.title}\n${message.body}`
      );
    } catch (error) {
      console.error("SMS Error:", error);
    }
  }

  return async function notifyFleetStatus(bus, status) {
    const owner = bus.ownerId;
    if (!owner) return;
    const message = policy.buildStatusMessage(bus, status);
    await sendEmail(owner, bus, message);
    await sendPush(owner, bus, status, message);
    await sendSms(owner, message);
  };
}

module.exports = { createFleetNotificationService };
