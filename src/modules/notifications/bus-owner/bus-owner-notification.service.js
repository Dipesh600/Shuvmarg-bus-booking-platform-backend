"use strict";

function createBusOwnerNotificationService({
  UserDeviceInfo,
  emailManager,
  notificationManager,
  createLocalNotification,
  sendOTP,
  generateStatusEmail,
  policy, // Required for formatting fleet status messages
  logger
}) {

  // ─── INTERNAL HELPERS ────────────────────────────────────────────────────────

  async function sendEmail(email, subject, htmlContent, context) {
    if (!email) return;
    try {
      await emailManager(email, subject, htmlContent);
    } catch (error) {
      logger.warn(`[busOwnerNotificationService] Email notification failed for ${context}:`, error.message);
    }
  }

  async function sendSms(phone, message, context) {
    if (!phone) return;
    try {
      await sendOTP(phone, message);
    } catch (error) {
      logger.warn(`[busOwnerNotificationService] SMS notification failed for ${context}:`, error.message);
    }
  }

  async function sendPushAndLocal(userId, title, body, meta, context) {
    try {
      await createLocalNotification(userId, context, title, body, meta, "busOwner");

      const devices = await UserDeviceInfo.find({ userId });
      const tokens = devices.map((device) => device.token).filter(Boolean);

      if (tokens.length > 0) {
        await notificationManager(tokens, title, body);
      }
    } catch (error) {
      logger.error(`[busOwnerNotificationService] Push Notification Error for ${context}:`, error);
    }
  }

  // ─── PUBLIC METHODS ──────────────────────────────────────────────────────────

  /**
   * Notifies the bus owner of a change in their fleet's status (approved, rejected, suspended).
   */
  async function notifyFleetStatus(bus, status) {
    const owner = bus.ownerId;
    if (!owner) return;

    const message = policy.buildStatusMessage(bus, status);

    // Email
    if (owner.email) {
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
      await sendEmail(owner.email, `Fleet Status Update - ${bus.busNumber}`, html, "FLEET_STATUS_UPDATE");
    }

    // SMS
    await sendSms(owner.phone || owner.contactNumber, `${message.title}\n${message.body}`, "FLEET_STATUS_UPDATE");

    // Push/Local
    await sendPushAndLocal(owner._id, message.title, message.body, { fleetId: bus._id, status }, "FLEET_STATUS_UPDATE");
  }

  /**
   * Notifies the bus owner about KYC review results.
   */
  async function notifyKycResult({ owner, user, status, documents }) {
    if (!user) return;

    // Email
    await sendEmail(user.email, "Bus Owner KYC Update", generateStatusEmail(user.name, status, documents), "BUS_OWNER_KYC_UPDATE");

    // SMS
    let smsMessage = `Dear ${user.name || "Bus Owner"}, your KYC status is ${status}.`;
    if (documents && documents.length > 0) {
      smsMessage += ` Invalid documents: ${documents.map(({ label }) => label).join(", ")}.`;
    }
    await sendSms(user.phone, smsMessage, "BUS_OWNER_KYC_UPDATE");

    // Push/Local
    const title = "Bus Owner KYC Updated";
    const body = documents && documents.length > 0
        ? `Status: ${status}. Some documents need attention.`
        : `Status: ${status}.`;

    await sendPushAndLocal(user._id || owner.user, title, body, { verificationStatus: status }, "BUS_OWNER_KYC_UPDATE");
  }

  /**
   * Notifies the bus owner that their fleet documents are expiring soon.
   */
  async function notifyDocumentExpiryAlert(fleet, expiredDocs) {
    const docList = expiredDocs.map(d => `• ${d.name}: expires in ${d.daysLeft} day(s)`).join("\n");
    const message = `Fleet "${fleet.busName}" has documents expiring soon:\n${docList}\nPlease renew immediately to avoid suspension.`;

    await sendPushAndLocal(fleet.ownerId, "Document Expiry Alert", message, { fleetId: fleet._id, fleetName: fleet.busName, documents: expiredDocs }, "FLEET_DOC_EXPIRY_ALERT");
  }

  /**
   * Notifies the bus owner that their fleet has been automatically suspended due to expired documents.
   */
  async function notifyFleetSuspendedForDocs(fleet) {
    const title = "Fleet Suspended — Expired Documents";
    const body = `Your fleet "${fleet.busName}" has been suspended due to expired compliance documents. Please update your documents and contact support.`;

    await sendPushAndLocal(fleet.ownerId, title, body, { fleetId: fleet._id }, "FLEET_SUSPENDED");
  }

  return {
    notifyFleetStatus,
    notifyKycResult,
    notifyDocumentExpiryAlert,
    notifyFleetSuspendedForDocs
  };
}

module.exports = { createBusOwnerNotificationService };
