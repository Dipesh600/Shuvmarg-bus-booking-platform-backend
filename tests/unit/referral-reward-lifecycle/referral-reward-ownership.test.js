"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../../..");
const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");

test("legacy referral V2 service is retired with no live references", () => {
  assert.equal(
    fs.existsSync(path.join(root, "services/referralV2Service.js")),
    false
  );
  const controller = read(
    "controllers/referralController/referralController.js"
  );
  const fleetComposition = read(
    "src/modules/admin/fleet-workstation/index.js"
  );
  assert.equal(controller.includes("services/referralV2Service"), false);
  assert.equal(fleetComposition.includes("services/referralV2Service"), false);
  assert.match(controller, /src\/modules\/referral\/reward-lifecycle/);
  assert.match(fleetComposition, /referral\/reward-lifecycle/);
});

test("neutral module exposes the complete legacy public surface", () => {
  const index = read("src/modules/referral/reward-lifecycle/index.js");
  for (const operation of [
    "createReferral",
    "processJourneyCompletion",
    "getReferralDashboard",
    "getReferralStatus",
    "voidReferral",
    "getUnlockAmount",
    "UNLOCK_SCHEDULE",
    "TOTAL_REFERRAL_REWARD",
  ]) {
    assert.match(index, new RegExp(`\\b${operation}\\b`));
  }
});

test("role adapters retain their distinct responsibilities", () => {
  const controller = read(
    "controllers/referralController/referralController.js"
  );
  const fleetUnlock = read(
    "src/modules/admin/fleet-workstation/referral-unlock.service.js"
  );
  assert.match(controller, /referralRewardService\.createReferral/);
  assert.match(controller, /referralRewardService\.getReferralDashboard/);
  assert.match(fleetUnlock, /processJourneyCompletion/);
  assert.doesNotMatch(
    fleetUnlock,
    /referralService\.(createReferral|getReferralDashboard)/
  );
});

test("baseline no longer carries the retired 642-line service", () => {
  const baseline = read("config/refactor-file-size-baseline.json");
  assert.equal(baseline.includes("services/referralV2Service.js"), false);
});
