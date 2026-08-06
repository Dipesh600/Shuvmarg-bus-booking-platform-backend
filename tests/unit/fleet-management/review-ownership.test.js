"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { ApiError } = require("../../../src/contracts");
const {
  createFleetReviewService,
} = require("../../../src/modules/fleet-management/fleet-review.service");

test("rejected fleet resubmission resets exact review state", async () => {
  let saved = 0;
  const fleet = {
    approvalStatus: "REJECTED", status: "INACTIVE", rejectionReason: "bad",
    documentReviews: { fitnessCert: { status: "fixed" } },
    async save() { saved += 1; },
  };
  const service = createFleetReviewService({
    repository: { findDocument: async () => fleet }, storage: {}, mapper: {},
  });
  assert.equal(await service.resubmitFleet("f"), fleet);
  assert.equal(saved, 1);
  assert.equal(fleet.approvalStatus, "PENDING");
  assert.equal(fleet.rejectionReason, null);
  assert.deepEqual(fleet.documentReviews.routePermit, {
    status: "pending", reason: null,
  });
});

test("resubmission rejects remaining failed documents", async () => {
  const fleet = {
    approvalStatus: "REJECTED",
    documentReviews: {
      insurance: { status: "rejected" }, bluebook: { status: "rejected" },
    },
  };
  const service = createFleetReviewService({
    repository: { findDocument: async () => fleet }, storage: {}, mapper: {},
  });
  await assert.rejects(
    service.resubmitFleet("f"),
    (err) => err instanceof ApiError && err.code === "FLEET_VALIDATION_FAILED"
  );
});

test("document reupload marks review and maps the saved fleet", async () => {
  const marked = [];
  const fleet = {
    approvalStatus: "REJECTED", documentReviews: {}, fleetDocuments: {},
    markModified: (field) => marked.push(field), async save() {},
    toObject: () => ({ id: "fleet" }),
  };
  const calls = [];
  const service = createFleetReviewService({
    repository: { findDocument: async () => fleet },
    storage: { replaceDocument: async (...args) => calls.push(args) },
    mapper: { withPresignedUrls: async (value) => ({ ...value, signed: true }) },
  });
  assert.deepEqual(
    await service.reuploadFleetDocument("f", "insurance", "file", "owner"),
    { id: "fleet", signed: true }
  );
  assert.equal(calls[0][1], "insurance");
  assert.deepEqual(fleet.documentReviews.insurance, { status: "fixed", reason: null });
  assert.deepEqual(marked, ["documentReviews", "fleetDocuments"]);
});

test("legacy service is retired and both consumers use the new boundary", () => {
  const root = path.resolve(__dirname, "../../..");
  assert.equal(fs.existsSync(path.join(root, "services/fleetService.js")), false);
  const baseline = fs.readFileSync(
    path.join(root, "config/refactor-file-size-baseline.json"), "utf8"
  );
  assert.equal(baseline.includes("services/fleetService.js"), false);
  for (const [relative, expectedImport] of [
    ["src/modules/bus-owner/fleet-management/index.js", "../../fleet-management"],
    [
      "controllers/adminController/busOwnerController/fleetController.js",
      "src/modules/fleet-management",
    ],
  ]) {
    const source = fs.readFileSync(path.join(root, relative), "utf8");
    assert.equal(source.includes("services/fleetService"), false);
    assert.equal(source.includes(expectedImport), true);
  }
  const api = require("../../../src/modules/fleet-management");
  assert.deepEqual(Object.keys(api).sort(), [
    "createFleet", "getFleetDetails", "getFleetDetailsRaw",
    "getFleetsByOwnerId", "removeFleet", "resubmitFleet",
    "reuploadFleetDocument", "updateFleetDetails",
  ]);
});
