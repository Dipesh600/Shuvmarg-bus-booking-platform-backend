"use strict";

const Outbox = require("../../../../models/notificationOutboxModel");
const notificationOutbox = require("../../notifications/outbox");
const { MESSAGE_STATUSES, MESSAGE_TYPES } = require("../../notifications/outbox/notification-outbox.constants");

async function listSmsNotifications(query = {}, deps = {}) {
  const Model = deps.Outbox || Outbox;
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(query.limit, 10) || 30));
  const filter = {};
  if (query.status) {
    if (!MESSAGE_STATUSES.includes(query.status)) throw Object.assign(new Error("Invalid SMS status."), { statusCode: 400 });
    filter.status = query.status;
  }
  if (query.messageType) {
    if (!MESSAGE_TYPES.includes(query.messageType)) throw Object.assign(new Error("Invalid SMS message type."), { statusCode: 400 });
    filter.messageType = query.messageType;
  }
  const [items, total, counts] = await Promise.all([
    Model.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Model.countDocuments(filter),
    Model.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
  ]);
  return { items, pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    counts: Object.fromEntries(counts.map(row => [row._id, row.count])) };
}

async function replaySmsNotification({ messageId, adminId, reason }, deps = {}) {
  if (!reason || typeof reason !== "string" || reason.trim().length < 5 || reason.length > 300) {
    throw Object.assign(new Error("Give a replay reason between 5 and 300 characters."), { statusCode: 400 });
  }
  const api = deps.notificationOutbox || notificationOutbox;
  const job = await api.replayFailedSms(messageId, {
    actorType: "ADMIN", actorId: adminId, reason: reason.trim(),
  }, deps.Outbox ? { OutboxModel: deps.Outbox, now: deps.now || new Date() } : undefined);
  const delivery = await api.deliverSmsNotification(job._id, deps.send ? { send: deps.send } : {});
  return delivery || { status: job.status, jobId: job._id };
}

module.exports = { listSmsNotifications, replaySmsNotification };
