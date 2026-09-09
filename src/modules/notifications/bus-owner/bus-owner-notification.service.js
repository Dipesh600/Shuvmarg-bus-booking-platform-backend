"use strict";

const { createNotificationDelivery } = require('./bus-owner-notification-delivery');

function createBusOwnerNotificationService({
  UserDeviceInfo,
  emailManager,
  notificationManager,
  createLocalNotification,
  sendOTP,
  generateStatusEmail,
  policy, // Required for formatting fleet status messages
  logger,
  notificationOutbox,
}) {
  const { sendEmail, sendPushAndLocal, sendSms } = createNotificationDelivery({
    UserDeviceInfo,
    emailManager,
    notificationManager,
    createLocalNotification,
    sendOTP,
    logger,
    notificationOutbox,
  });

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
    await sendSms(owner.phone || owner.contactNumber, `${message.title}\n${message.body}`, "FLEET_STATUS_UPDATE", {
      messageType: "FLEET_STATUS",
      idempotencyKey: `fleet:${bus._id}:status:${status}`,
      businessReference: `fleet:${bus._id}`,
      userId: owner._id,
      ownerId: owner._id,
    });

    // Push/Local
    await sendPushAndLocal(owner._id, message.title, message.body, { fleetId: bus._id, status }, "FLEET_STATUS_UPDATE");
  }

  async function notifyAdminCreatedFleet(bus, loginUrl) {
    const owner = bus.ownerId;
    if (!owner) return { smsDelivered: false };
    const title = "Fleet added by Shuvmarg";
    const body = `Fleet ${bus.busName} (${bus.busNumber}) was added to your operator account. Sign in to review its setup: ${loginUrl}`;
    const smsStatus = await sendSms(owner.phone || owner.contactNumber, `${title}. ${body}`, "FLEET_ADMIN_CREATED", {
      messageType: "FLEET_CREATED",
      idempotencyKey: `fleet:${bus._id}:created:1`,
      businessReference: `fleet:${bus._id}`,
      userId: owner._id,
      ownerId: owner._id,
    });
    await sendPushAndLocal(owner._id, title, body, {
      fleetId: bus._id,
      status: bus.approvalStatus,
    }, "FLEET_ADMIN_CREATED");
    const smsAccepted = ["PROVIDER_ACCEPTED", "DELIVERED"].includes(smsStatus);
    return { smsStatus, smsAccepted, smsDelivered: smsAccepted };
  }

  async function notifyKycResult({ owner, user, status, documents }) {
    if (!user) return;

    // Email
    await sendEmail(user.email, "Bus Owner KYC Update", generateStatusEmail(user.name, status, documents), "BUS_OWNER_KYC_UPDATE");

    // SMS
    let smsMessage = `Dear ${user.name || "Bus Owner"}, your KYC status is ${status}.`;
    if (documents && documents.length > 0) {
      smsMessage += ` Invalid documents: ${documents.map(({ label }) => label).join(", ")}.`;
    }
    await sendSms(user.phone, smsMessage, "BUS_OWNER_KYC_UPDATE", {
      messageType: "BUS_OWNER_KYC",
      idempotencyKey: `bus-owner:${owner?._id || owner?.id || user._id}:kyc:${status}:${owner?.__v || 0}`,
      businessReference: `bus-owner:${owner?._id || owner?.id || user._id}`,
      userId: user._id || owner.user,
      ownerId: user._id || owner.user,
    });

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
    notifyAdminCreatedFleet,
    notifyKycResult,
    notifyDocumentExpiryAlert,
    notifyFleetSuspendedForDocs
  };
}

module.exports = { createBusOwnerNotificationService };
