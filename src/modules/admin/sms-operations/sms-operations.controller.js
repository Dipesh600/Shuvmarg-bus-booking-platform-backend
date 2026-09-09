"use strict";

const service = require("./sms-operations.service");

const replayMessage = (status) => {
  if (["PROVIDER_ACCEPTED", "DELIVERED"].includes(status)) return "SMS accepted into the provider queue.";
  if (["FAILED", "EXPIRED", "CANCELLED"].includes(status)) return "SMS replay failed. Review the delivery error before retrying.";
  return "SMS replay saved for automatic retry.";
};

const fail = (res, error) => res.status(error.statusCode || 500).json({
  success: false,
  message: error.statusCode ? error.message : "Unable to complete the SMS operation.",
});

async function list(req, res) {
  try {
    return res.status(200).json({ success: true, data: await service.listSmsNotifications(req.query) });
  } catch (error) {
    return fail(res, error);
  }
}

async function replay(req, res) {
  try {
    const result = await service.replaySmsNotification({ messageId: req.params.messageId,
      adminId: req.adminInfo.id, reason: req.body?.reason });
    return res.status(200).json({ success: true,
      message: replayMessage(result.status),
      data: result });
  } catch (error) {
    return fail(res, error);
  }
}

module.exports = { list, replay, replayMessage };
