"use strict";

const { randomUUID } = require("node:crypto");
const Outbox = require("../models/notificationOutboxModel");
const logger = require("../utils/logger");
const policy = require("../src/modules/notifications/outbox/notification-outbox.policy");
const { MESSAGE_TYPES } = require("../src/modules/notifications/outbox/notification-outbox.constants");

const LEASE_MS = 120_000;
const PROVIDER_CIRCUIT_MS = 300_000;
let lastConfigurationAlertAt = 0;
let providerCircuitOpenUntil = 0;
let startupConfigurationAlerted = false;

function dueFilter(id, now, enabledTypes = null) {
  return {
    ...(id ? { _id: id } : {}),
    ...(enabledTypes ? { messageType: { $in: enabledTypes } } : {}),
    channel: "SMS",
    $and: [
      { $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] },
      { $or: [
        { status: { $in: ["PENDING", "RETRY_SCHEDULED"] }, nextAttemptAt: { $lte: now } },
        { status: "PROCESSING", leaseExpiresAt: { $lte: now } },
      ] },
    ],
  };
}

function enabledMessageTypes(env = process.env) {
  const configured = String(env.SMS_OUTBOX_ENABLED_TYPES || "").trim();
  if (!configured) return null;
  const requested = [...new Set(configured.split(",").map(value => value.trim().toUpperCase()).filter(Boolean))];
  const invalid = requested.filter(value => !MESSAGE_TYPES.includes(value));
  if (invalid.length) throw new Error(`Unsupported SMS_OUTBOX_ENABLED_TYPES: ${invalid.join(", ")}`);
  return requested;
}

function smsWorkerEnabled(env = process.env, log = logger) {
  if (String(env.SMS_OUTBOX_WORKER_ENABLED || '').toLowerCase() !== 'true') return false;
  try {
    enabledMessageTypes(env);
    if (!String(env.SPARROW_SMS_TOKEN || '').trim()) {
      throw new Error('SPARROW_SMS_TOKEN is required when the SMS outbox worker is enabled');
    }
    startupConfigurationAlerted = false;
    return true;
  } catch (error) {
    if (!startupConfigurationAlerted) {
      startupConfigurationAlerted = true;
      log.error('SMS outbox worker is disabled by invalid configuration', { error: error.message });
    }
    return false;
  }
}

async function claim(id, { now, OutboxModel }) {
  const leaseToken = randomUUID();
  const job = await OutboxModel.findOneAndUpdate(dueFilter(id, now), {
    $set: { status: "PROCESSING", leaseToken, leaseExpiresAt: new Date(now.getTime() + LEASE_MS), lastAttemptAt: now },
    $inc: { attempts: 1 },
  }, { new: true }).select("+recipientPhone +body +leaseToken");
  return job ? { job, leaseToken } : null;
}

async function deliverSmsNotification(id, options = {}) {
  const OutboxModel = options.OutboxModel || Outbox;
  const now = options.now ? options.now() : new Date();
  if (providerCircuitOpenUntil > now.getTime()) return { status: "PENDING", jobId: id };
  const claimed = await claim(id, { now, OutboxModel });
  if (!claimed) return null;
  const { job, leaseToken } = claimed;
  const owned = { _id: job._id, status: "PROCESSING", leaseToken };
  const applicable = options.isApplicable
    ? await options.isApplicable(job)
    : await isApplicable(job);
  if (!applicable) {
    await OutboxModel.updateOne(owned, { $set: { status: "CANCELLED", nextAttemptAt: null },
      $unset: { leaseToken: 1, leaseExpiresAt: 1 } });
    return { status: "CANCELLED", jobId: job._id };
  }
  const send = options.send || require("../handlers/sparro-otp");
  try {
    const result = await send(job.recipientPhone, job.body);
    if (result?.queued !== true) throw Object.assign(new Error("SMS provider did not accept the message"), {
      category: "PROVIDER_REJECTED", retryable: true,
    });
    await OutboxModel.updateOne(owned, {
      $set: { status: "PROVIDER_ACCEPTED", providerReference: result.providerReference || null,
        providerAcceptedAt: now, lastError: { category: null, code: null, message: null, at: null } },
      $unset: { leaseToken: 1, leaseExpiresAt: 1 },
    });
    providerCircuitOpenUntil = 0;
    return { status: "PROVIDER_ACCEPTED", jobId: job._id };
  } catch (error) {
    const classification = policy.classifyDeliveryError(error);
    const expired = job.expiresAt && new Date(job.expiresAt) <= now;
    const retryable = classification.retryable && job.attempts < job.maxAttempts && !expired;
    const status = expired ? "EXPIRED" : retryable ? "RETRY_SCHEDULED" : "FAILED";
    const update = {
      $set: { status, lastError: { category: classification.category, code: classification.code,
        message: policy.sanitizeErrorMessage(error.message), at: now } },
      $unset: { leaseToken: 1, leaseExpiresAt: 1 },
    };
    if (retryable) update.$set.nextAttemptAt = policy.nextRetryAt(job.attempts, now);
    await OutboxModel.updateOne(owned, update);
    if (["AUTHENTICATION", "CONFIGURATION"].includes(classification.category)
      && now.getTime() - lastConfigurationAlertAt > 300_000) {
      lastConfigurationAlertAt = now.getTime();
      providerCircuitOpenUntil = now.getTime() + PROVIDER_CIRCUIT_MS;
      logger.error("SMS provider configuration requires attention", { code: classification.code });
    }
    logger.warn("SMS delivery attempt did not complete", { jobId: job._id, messageType: job.messageType,
      recipient: policy.maskPhone(job.recipientPhone), status, code: classification.code });
    return { status, jobId: job._id };
  }
}

async function isApplicable(job) {
  if (job.messageType !== "BOOKING_CONFIRMED") return true;
  const bookingId = String(job.businessReference || "").replace(/^booking:/, "");
  if (!bookingId) return false;
  return Boolean(await require("../models/bookTicketModel").exists({ _id: bookingId, status: "booked" }));
}

async function recoverSmsNotifications(options = {}) {
  const OutboxModel = options.OutboxModel || Outbox;
  const now = options.now ? options.now() : new Date();
  await OutboxModel.updateMany({ expiresAt: { $lte: now }, $or: [
    { status: { $in: ["PENDING", "RETRY_SCHEDULED"] } },
    { status: "PROCESSING", leaseExpiresAt: { $lte: now } },
  ] },
    { $set: { status: "EXPIRED" } });
  if (providerCircuitOpenUntil > now.getTime()) return 0;
  const types = enabledMessageTypes(options.env || process.env);
  if (types?.length === 0) return 0;
  const jobs = await OutboxModel.find(dueFilter(null, now, types)).select("_id").sort({ nextAttemptAt: 1 }).limit(100);
  for (const job of jobs) await deliverSmsNotification(job._id, options);
  return jobs.length;
}

const resetProviderCircuitForTests = () => {
  providerCircuitOpenUntil = 0;
  lastConfigurationAlertAt = 0;
  startupConfigurationAlerted = false;
};
module.exports = { LEASE_MS, PROVIDER_CIRCUIT_MS, deliverSmsNotification, dueFilter,
  enabledMessageTypes, recoverSmsNotifications, resetProviderCircuitForTests, smsWorkerEnabled };
