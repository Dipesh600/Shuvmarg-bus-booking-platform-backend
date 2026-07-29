"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const moduleDir = path.join(
  root, "src/modules/admin/ticket-schedule-management"
);

function containsReference(directory, text) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory() && containsReference(target, text)) return true;
    if (
      entry.isFile() &&
      entry.name.endsWith(".js") &&
      fs.readFileSync(target, "utf8").includes(text)
    ) {
      return true;
    }
  }
  return false;
}

test("ticket schedule module fully retires the legacy controller", () => {
  assert.equal(fs.existsSync(path.join(
    root,
    "controllers/adminController/ticket-controller/adminTicketController.js"
  )), false);
  const router = fs.readFileSync(
    path.join(root, "routes/adminRoutes/adminRoutes.js"), "utf8"
  );
  assert.match(router, /src\/modules\/admin\/ticket-schedule-management/);
  assert.doesNotMatch(router, /adminTicketController/);
});

test("module exports exactly the twelve live route handlers", () => {
  const api = require("../../src/modules/admin/ticket-schedule-management");
  assert.deepEqual(Object.keys(api).sort(), [
    "createRoute", "createTicket", "deleteRoute", "deleteTicket",
    "getAllRoutes", "getAllTickets", "getRouteById", "getTicketById",
    "toggleRouteStatus", "updateRoute", "updateTicket",
    "updateTicketStatus",
  ]);
  assert.equal(api.getBoardingPointByUserId, undefined);
});

test("retired boarding-point export has no production caller", () => {
  for (const directory of ["routes", "src", "controllers"]) {
    assert.equal(containsReference(
      path.join(root, directory),
      "getBoardingPointByUserId"
    ), false);
  }
});

test("all extracted production files remain within 150 lines", () => {
  for (const file of fs.readdirSync(moduleDir)) {
    if (!file.endsWith(".js")) continue;
    const count = fs.readFileSync(path.join(moduleDir, file), "utf8")
      .split("\n").length - 1;
    assert.ok(count <= 150, `${file} has ${count} lines`);
  }
});
