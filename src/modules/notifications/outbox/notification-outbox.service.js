"use strict";

const Outbox = require("../../../../models/notificationOutboxModel");
const { MESSAGE_TYPES } = require("./notification-outbox.constants");
const { maskPhone, normalizePhone, sanitizeErrorMessage } = require("./notification-outbox.policy");

const typeSet = new Set(MESSAGE_TYPES);

function validateInput(input) {
  if (!typeSet.has(input.messageType)) throw new Error("Unsupported SMS message type");
  if (!input.idempotencyKey || String(input.idempotencyKey).length > 220) throw new Error("A valid SMS idempotency key is required");
  if (!input.businessReference || String(input.businessReference).length > 180) throw new Error("A valid SMS business reference is required");
  const body = String(input.body || "").trim();
  if (!body || body.length > 1000) throw new Error("SMS body must contain 1 to 1000 characters");
  return { body, recipientPhone: normalizePhone(input.recipientPhone) };
}

async function enqueueSms(input, { session = null, OutboxModel = Outbox } = {}) {
  const { body, recipientPhone } = validateInput(input);
  const setOnInsert = {
    channel: "SMS",
    messageType: input.messageType,
    templateVersion: input.templateVersion || 1,
    idempotencyKey: String(input.idempotencyKey),
    businessReference: String(input.businessReference),
    recipientPhone,
    recipientMasked: maskPhone(recipientPhone),
    body,
    userId: input.userId || null,
    ownerId: input.ownerId || null,
    brandId: input.brandId || null,
    status: "PENDING",
    attempts: 0,
    maxAttempts: input.maxAttempts || 5,
    nextAttemptAt: input.nextAttemptAt || new Date(),
    expiresAt: input.expiresAt || null,
    manualReplay: input.manualReplay || undefined,
  };
  try {
    return await OutboxModel.findOneAndUpdate(
      { idempotencyKey: setOnInsert.idempotencyKey },
      { $setOnInsert: setOnInsert },
      { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true, ...(session ? { session } : {}) },
    );
  } catch (error) {
    if (error?.code !== 11000) throw error;
    return OutboxModel.findOne({ idempotencyKey: setOnInsert.idempotencyKey }).session(session || null);
  }
}

function legacyQueueStatus(job) {
  return ["PROVIDER_ACCEPTED", "DELIVERED"].includes(job?.status) ? "QUEUED" : "FAILED";
}

async function cancelPendingSms(businessReference, { OutboxModel = Outbox, session = null,
  excludeIdempotencyKey = null } = {}) {
  if (!businessReference) return { modifiedCount: 0 };
  const filter = { businessReference: String(businessReference),
    status: { $in: ["PENDING", "RETRY_SCHEDULED"] } };
  if (excludeIdempotencyKey) filter.idempotencyKey = { $ne: String(excludeIdempotencyKey) };
  return OutboxModel.updateMany(filter, {
    $set: { status: "CANCELLED", nextAttemptAt: null },
  }, session ? { session } : {});
}

async function replayFailedSms(id, actor, { OutboxModel = Outbox, now = new Date() } = {}) {
  const source = await OutboxModel.findById(id).select("+recipientPhone +body");
  if (!source) throw Object.assign(new Error("SMS notification not found."), { statusCode: 404 });
  if (source.status !== "FAILED") {
    throw Object.assign(new Error("Only a failed SMS notification can be replayed."), { statusCode: 409 });
  }
  if (source.expiresAt && source.expiresAt <= now) {
    throw Object.assign(new Error("This message has expired. Use the related invitation or business action to create a fresh message."),
      { statusCode: 409 });
  }
  const reason = sanitizeErrorMessage(actor?.reason || "Manual operations replay");
  return enqueueSms({
    messageType: source.messageType,
    templateVersion: source.templateVersion,
    idempotencyKey: `${source.idempotencyKey}:manual:${Math.floor(now.getTime() / 60000)}`,
    businessReference: source.businessReference,
    recipientPhone: source.recipientPhone,
    body: source.body,
    userId: source.userId,
    ownerId: source.ownerId,
    brandId: source.brandId,
    maxAttempts: source.maxAttempts,
    expiresAt: source.expiresAt,
    manualReplay: { actorType: actor.actorType, actorId: String(actor.actorId), reason, at: now,
      sourceMessageId: source._id },
  }, { OutboxModel });
}

async function findLatestSms(businessReference, scope = {}, { OutboxModel = Outbox } = {}) {
  const filter = { businessReference: String(businessReference) };
  if (scope.ownerId) filter.ownerId = scope.ownerId;
  if (scope.userId) filter.userId = scope.userId;
  return OutboxModel.findOne(filter).sort({ createdAt: -1 }).lean();
}

module.exports = { cancelPendingSms, enqueueSms, findLatestSms, legacyQueueStatus, replayFailedSms, validateInput };
