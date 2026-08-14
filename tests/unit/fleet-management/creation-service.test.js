"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createFleetCreationService,
} = require("../../../src/modules/fleet-management/fleet-creation.service");

const data = {
  busName: "Bus", busNumber: "b1", busType: "AC",
  totalSeats: 40, vehicleType: "BUS", requestOriginCity: "A",
  requestDestinationCity: "B", requestViaStops: '["C"]', brandId: "brand",
  registrationYear: 2024,
};

function setup({ failUpload = false } = {}) {
  const events = [];
  let skeleton;
  class Bus {
    constructor(fields) {
      Object.assign(this, fields, { _id: "fleet-1" });
      skeleton = this;
    }
    async save() { events.push("fleet.save"); return this; }
    static findByIdAndDelete(id) { events.push(`fleet.delete:${id}`); return Promise.resolve(); }
  }
  class RouteRequest {
    constructor(fields) { Object.assign(this, fields, { _id: "route-1" }); }
    async save() { events.push("route.save"); return this; }
    static async findByIdAndUpdate(id, update) {
      events.push(`route.link:${id}:${update.fleetId}`);
    }
  }
  const policy = {
    async validateReferences() { events.push("references"); },
    async validateBrand() { events.push("brand"); },
  };
  const storage = {
    async uploadCreationAssets(fleet, input, files, keys) {
      events.push("upload"); keys.push("new-key");
      if (failUpload) throw new Error("upload failed");
      return { fleetImages: ["image"], fleetDocuments: { insurance: { url: "doc" } } };
    },
    async deleteFromS3(keys) { events.push(`s3.delete:${keys.join(",")}`); },
  };
  const logs = [];
  const service = createFleetCreationService({
    Bus, RouteRequest, policy, storage,
    logger: { error: (...args) => logs.push(args) },
  });
  return { service, events, logs, getSkeleton: () => skeleton };
}

test("creation preserves route, skeleton, upload, and backlink ordering", async () => {
  const h = setup();
  const fleet = await h.service.createFleet("owner", data, {}, "ADMIN");
  assert.deepEqual(h.events, [
    "references", "brand", "route.save", "fleet.save", "upload",
    "fleet.save", "route.link:route-1:fleet-1",
  ]);
  assert.equal(fleet.ownerId, "owner");
  assert.equal(fleet.createdBy, "ADMIN");
  assert.equal(fleet.busNumber, "B1");
  assert.equal(fleet.routeRequestId, "route-1");
  assert.equal(fleet.approvalStatus, "DRAFT");
  assert.deepEqual(fleet.fleetImages, ["image"]);
});

test("creation failure deletes uploaded keys and skeleton, then rethrows", async () => {
  const h = setup({ failUpload: true });
  await assert.rejects(
    h.service.createFleet("owner", data, {}), /upload failed/
  );
  assert.deepEqual(h.events.slice(-3), [
    "upload", "s3.delete:new-key", "fleet.delete:fleet-1",
  ]);
  assert.equal(h.logs.length, 1);
  assert.match(h.logs[0][0], /Cleaning up S3 orphans/);
});

test("creation: invalid brand throws before creating route request or fleet skeleton (zero DB writes)", async () => {
  const events = [];
  class Bus {
    async save() { events.push("fleet.save"); return this; }
  }
  class RouteRequest {
    async save() { events.push("route.save"); return this; }
  }
  const policy = {
    async validateReferences() { events.push("references"); },
    async validateBrand() {
      events.push("brand.reject");
      const err = new Error("Invalid operator brand");
      err.code = "FLEET_BRAND_NOT_FOUND";
      throw err;
    },
  };
  const storage = {
    async uploadCreationAssets() { events.push("upload"); return {}; },
    async deleteFromS3() {},
  };
  const service = createFleetCreationService({ Bus, RouteRequest, policy, storage });

  await assert.rejects(
    () => service.createFleet("owner", data, {}),
    (err) => err.code === "FLEET_BRAND_NOT_FOUND"
  );

  assert.deepEqual(events, ["references", "brand.reject"]);
});
