"use strict";

const replayRateLimit = require("../../../../middleware/adminSmsReplayRateLimit");
const controller = require("./sms-operations.controller");

module.exports = (router, adminMiddleware, requireAccountAdministration) => {
  router.get("/notifications/sms", adminMiddleware, requireAccountAdministration, controller.list);
  router.post("/notifications/sms/:messageId/replay", adminMiddleware, requireAccountAdministration,
    replayRateLimit, controller.replay);
};
