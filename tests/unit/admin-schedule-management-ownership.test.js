"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("admin schedule-management owns the retired controller and service", () => {
  assert.equal(
    fs.existsSync(
      path.join(root, "controllers/adminController/scheduleController.js")
    ),
    false
  );
  assert.equal(
    fs.existsSync(path.join(root, "services/scheduleService.js")),
    false
  );
  const routes = read("routes/adminRoutes/adminRoutes.js");
  assert.match(routes, /src\/modules\/admin\/schedule-management/);
  assert.doesNotMatch(routes, /adminController\/scheduleController/);
  const directory = path.join(root, "src/modules/admin/schedule-management");
  const files = fs.readdirSync(directory).filter((file) => file.endsWith(".js"));
  assert.ok(files.length >= 10);
  for (const file of files) {
    const lines =
      fs.readFileSync(path.join(directory, file), "utf8").split("\n").length - 1;
    assert.ok(lines <= 150, `${file} exceeds 150 physical lines`);
  }
});

test("bus-owner schedule-management remains a separate live module", () => {
  const directory = path.join(root, "src/modules/bus-owner/schedule-management");
  assert.equal(fs.existsSync(directory), true);
  assert.equal(fs.existsSync(path.join(directory, "index.js")), true);
});

test("admin schedule module exports every routed operation", () => {
  const schedules = require("../../src/modules/admin/schedule-management");
  const expected = [
    "activateSchedule",
    "burstGenerateTrips",
    "createSchedule",
    "createScheduleVersion",
    "deactivateSchedule",
    "deleteSchedule",
    "getAllSchedules",
    "getScheduleById",
    "getSchedulesByBrand",
    "getTripsBySchedule",
    "goLiveSchedule",
    "manualGenerateTrips",
    "resumeSchedule",
    "suspendSchedule",
    "updateSchedule",
  ];
  assert.deepEqual(Object.keys(schedules).sort(), expected);
  for (const operation of expected) {
    assert.equal(typeof schedules[operation], "function");
  }
});
