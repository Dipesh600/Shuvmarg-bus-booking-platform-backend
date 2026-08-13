"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("scheduled and manual trip creation use the transactional compatibility writer", () => {
  const cron = read("services/tripGeneratorCron.js");
  const manual = read("services/tripService.js");
  assert.match(cron, /tripSeatLayoutDualWriteService\.createTrip/);
  assert.match(manual, /tripSeatLayoutDualWriteService\.createTrip/);
  assert.doesNotMatch(cron, /Seat\.create/);
  assert.match(manual, /TripSeatLayoutSnapshot\.exists/);
});

test("V3 APIs are registered behind existing admin and owner authentication boundaries", () => {
  const admin = read("routes/adminRoutes/adminRoutes.js");
  const owner = read("routes/busOwner/busOwner.js");
  assert.match(admin, /registerAdminSeatLayoutV3Routes\(router, adminMiddleware\)/);
  assert.match(owner, /router\.use\(auth, verifyRoleFromDB, busOwnerMiddleware\)/);
  assert.match(owner, /registerBusOwnerSeatLayoutV3Routes\(router\)/);
});
