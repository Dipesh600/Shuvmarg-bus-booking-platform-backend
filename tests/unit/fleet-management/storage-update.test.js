"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createFleetStorageService,
} = require("../../../src/modules/fleet-management/fleet-storage.service");
const {
  createFleetUpdateService,
} = require("../../../src/modules/fleet-management/fleet-update.service");

test("creation assets preserve structured paths and exact key tracking", async () => {
  const uploads = [];
  const storage = createFleetStorageService({
    buildS3Path: (input) => JSON.stringify(input),
    uploadFileToS3: async (file, destination) => {
      uploads.push({ file, destination });
      return `key:${file}`;
    },
    deleteFromS3: async () => {},
  });
  const keys = [];
  const result = await storage.uploadCreationAssets(
    { _id: "fleet", fleetId: "F-1", ownerId: "owner", brandId: "brand" },
    { insurancePolicyNumber: "P1" },
    { imageFront: "front", insurance: "policy" },
    keys
  );
  assert.deepEqual(keys, ["key:front", "key:policy"]);
  assert.equal(result.fleetImages.length, 1);
  assert.equal(result.fleetImages[0].objectKey, "key:front");
  assert.equal(result.fleetImages[0].mimeType, "application/octet-stream");
  assert.ok(result.fleetImages[0].imageId);
  assert.ok(result.fleetImages[0].uploadedAt instanceof Date);
  assert.equal(result.fleetDocuments.insurance.url, "key:policy");
  assert.equal(result.fleetDocuments.insurance.objectKey, "key:policy");
  assert.ok(result.fleetDocuments.insurance.uploadedAt instanceof Date);
  assert.equal(result.fleetDocuments.insurance.policyNumber, "P1");
  assert.deepEqual(JSON.parse(uploads[0].destination), {
    type: "fleet_images", ownerId: "owner", brandId: "brand", fleetId: "F-1",
  });
  assert.deepEqual(JSON.parse(uploads[1].destination), {
    type: "fleet_docs", ownerId: "owner", brandId: "brand", fleetId: "F-1",
    documentType: "insurance",
  });
});

test("image replacement uploads new files before deleting old keys", async () => {
  const events = [];
  const storage = createFleetStorageService({
    buildS3Path: ({ type }) => type,
    uploadFileToS3: async (file) => { events.push(`upload:${file}`); return `key:${file}`; },
    deleteFromS3: async (keys) => { events.push(`delete:${keys.join(",")}`); },
    logger: { error() {} },
  });
  const fleet = {
    _id: "fleet", ownerId: "owner", brandId: null, fleetImages: ["old"],
  };
  const replaced = await storage.replaceFleetImages(fleet, { fleetImages: ["a", "b"] });
  assert.deepEqual(replaced.map((image) => image.objectKey), ["key:a", "key:b"]);
  assert.ok(replaced.every((image) => image.imageId && image.uploadedAt instanceof Date));
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(events, ["upload:a", "upload:b", "delete:old"]);
});

test("partial replacement failure removes only newly uploaded keys", async () => {
  const deleted = [];
  const storage = createFleetStorageService({
    buildS3Path: ({ type }) => type,
    uploadFileToS3: async (file) => {
      if (file === "bad") throw new Error("upload failed");
      return `key:${file}`;
    },
    deleteFromS3: async (keys) => deleted.push(keys),
  });
  await assert.rejects(
    storage.replaceFleetImages(
      { _id: "f", ownerId: "o", fleetImages: ["old"] },
      { fleetImages: ["good", "bad"] }
    ),
    /upload failed/
  );
  assert.deepEqual(deleted, [["key:good"]]);
});

test("fleet update preserves policy ordering and persistence options", async () => {
  const events = [];
  let persisted;
  const Bus = {
    findByIdAndUpdate(id, update, options) {
      persisted = { id, update, options };
      return { lean: async () => ({ _id: id, ...update }) };
    },
  };
  const policy = {
    restrictOwnerUpdate: () => events.push("restrict"),
    lockApprovedIdentity: () => events.push("lock"),
    normalizeBusNumber: async () => events.push("number"),
    resolveSeatLayoutVersion: async () => events.push("version"),
    verifySeatLayout: async () => events.push("layout"),
    parseCatalogAndReviews: () => events.push("parse"),
  };
  const service = createFleetUpdateService({
    Bus, policy,
    repository: { findDocument: async () => ({ _id: "f" }) },
    storage: { replaceFleetImages: async () => { events.push("images"); return ["new"]; } },
    mapper: { withPresignedUrls: async (fleet) => fleet },
  });
  const result = await service.updateFleetDetails("f", { busName: "Name" }, {}, "owner");
  assert.deepEqual(events, ["restrict", "lock", "images", "number", "version", "layout", "parse"]);
  assert.deepEqual(persisted, {
    id: "f", update: { busName: "Name", fleetImages: ["new"] },
    options: { new: true, runValidators: true },
  });
  assert.equal(result._id, "f");
});
