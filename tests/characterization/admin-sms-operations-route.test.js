"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const router = require("../../routes/adminRoutes/adminRoutes");
const adminMiddleware = require("../../middleware/adminMiddleware");
const requireAccountAdministration = require("../../middleware/requireAccountAdministration");
const replayRateLimit = require("../../middleware/adminSmsReplayRateLimit");
const controller = require("../../src/modules/admin/sms-operations");

test("SMS operations routes require current admin and account-administration authority", () => {
  const routes = router.stack.filter(layer => layer.route);
  const list = routes.find(layer => layer.route.path === "/notifications/sms" && layer.route.methods.get);
  const replay = routes.find(layer => layer.route.path === "/notifications/sms/:messageId/replay" && layer.route.methods.post);
  assert.deepEqual(list.route.stack.map(layer => layer.handle),
    [adminMiddleware, requireAccountAdministration, controller.list]);
  assert.deepEqual(replay.route.stack.map(layer => layer.handle),
    [adminMiddleware, requireAccountAdministration, replayRateLimit, controller.replay]);
});
