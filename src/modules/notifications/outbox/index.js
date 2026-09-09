"use strict";

const service = require("./notification-outbox.service");

async function dispatchSms(input, options = {}) {
  const job = await service.enqueueSms(input, options);
  if (options.session) return { status: "PENDING", jobId: job._id };
  const delivery = await require("../../../../services/notificationOutboxRecovery")
    .deliverSmsNotification(job._id, options.send ? { send: options.send } : {});
  return delivery || { status: job.status, jobId: job._id };
}

module.exports = {
  ...service,
  dispatchSms,
  deliverSmsNotification: (...args) => require("../../../../services/notificationOutboxRecovery").deliverSmsNotification(...args),
  recoverSmsNotifications: (...args) => require("../../../../services/notificationOutboxRecovery").recoverSmsNotifications(...args),
};
