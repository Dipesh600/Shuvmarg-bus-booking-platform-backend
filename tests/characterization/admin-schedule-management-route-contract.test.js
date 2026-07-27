"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const routes = require("../../routes/adminRoutes/adminRoutes.js");
const adminMiddleware = require("../../middleware/adminMiddleware.js");
const schedules = require("../../src/modules/admin/schedule-management");

test("admin schedule-management Express route contract", () => {
  const expected = [
    ["post", "/schedules", schedules.createSchedule],
    ["get", "/schedules", schedules.getAllSchedules],
    ["post", "/schedules/generate", schedules.manualGenerateTrips],
    ["get", "/schedules/:id", schedules.getScheduleById],
    ["patch", "/schedules/:id", schedules.updateSchedule],
    ["patch", "/schedules/:id/activate", schedules.activateSchedule],
    ["patch", "/schedules/:id/go-live", schedules.goLiveSchedule],
    ["patch", "/schedules/:id/suspend", schedules.suspendSchedule],
    ["patch", "/schedules/:id/resume", schedules.resumeSchedule],
    ["post", "/schedules/:id/version", schedules.createScheduleVersion],
    ["patch", "/schedules/:id/deactivate", schedules.deactivateSchedule],
    ["delete", "/schedules/:id", schedules.deleteSchedule],
    ["get", "/schedules/:id/trips", schedules.getTripsBySchedule],
    ["post", "/schedules/:id/burst", schedules.burstGenerateTrips],
    ["get", "/brands/:brandId/schedules", schedules.getSchedulesByBrand],
  ];
  const routeLayers = routes.stack.filter((layer) => layer.route);
  for (const [method, path, handler] of expected) {
    const matches = routeLayers.filter(
      (layer) => layer.route.path === path && layer.route.methods[method]
    );
    assert.equal(
      matches.length,
      1,
      `${method.toUpperCase()} ${path} must exist exactly once`
    );
    assert.deepEqual(
      matches[0].route.stack.map((layer) => layer.handle),
      [adminMiddleware, handler]
    );
  }
});
