"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createFleetStorageService,
} = require("../../../src/modules/fleet-management/fleet-storage.service");
const {
  createFleetUpdateService,
} = require("../../../src/modules/fleet-management/fleet-update.service");

const testUploadDeps = {
  validateFile: (file) => ({ mimeType: "image/webp", size: String(file).length }),
  processUpload: async (file) => file,
};

test("creation assets preserve structured paths and exact key tracking", async () => {
  const uploads = [];
  const storage = createFleetStorageService({
    buildS3Path: (input) => JSON.stringify(input),
    uploadFileToS3: async (file, destination) => {
      uploads.push({ file, destination });
      return `key:${file}`;
    },
    deleteFromS3: async () => {},
    ...testUploadDeps,
  });
  const keys = [];
  const result = await storage.uploadCreationAssets(
    { _id: "fleet", fleetId: "F-1", ownerId: "owner", brandId: "brand" },
    { insurancePolicyNumber: "P1" },
    { imageFront: "front", imageSide: "side", imageBack: "back", imageInside: "inside", insurance: "policy" },
    keys
  );
  assert.deepEqual(keys, ["key:front", "key:side", "key:back", "key:inside", "key:policy"]);
  assert.deepEqual(result.fleetImages.map((image) => image.view), ["FRONT", "SIDE", "BACK", "INSIDE"]);
  assert.equal(result.fleetDocuments.insurance.objectKey, "key:policy");
  assert.equal(result.fleetDocuments.insurance.policyNumber, "P1");
  assert.deepEqual(JSON.parse(uploads[0].destination), {
    type: "fleet_images", ownerId: "owner", brandId: "brand", fleetId: "F-1",
  });
  assert.deepEqual(JSON.parse(uploads[4].destination), {
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
    ...testUploadDeps,
  });
  const fleet = {
    _id: "fleet", ownerId: "owner", brandId: null, fleetImages: ["old"],
  };
  assert.deepEqual(
    (await storage.replaceFleetImages(fleet, { fleetImages: ["a", "b", "c", "d"] })).map((image) => image.objectKey),
    ["key:a", "key:b", "key:c", "key:d"]
  );
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(events, ["upload:a", "upload:b", "upload:c", "upload:d", "delete:old"]);
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
    ...testUploadDeps,
  });
  await assert.rejects(
    storage.replaceFleetImages(
      { _id: "f", ownerId: "o", fleetImages: ["old"] },
      { fleetImages: ["good", "bad", "third", "fourth"] }
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
    validateIdentityUpdate: () => events.push("identity"),
    normalizeBusNumber: async () => events.push("number"),
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
  assert.deepEqual(events, ["restrict", "lock", "identity", "images", "number", "layout", "parse"]);
  assert.deepEqual(persisted, {
    id: "f", update: { busName: "Name", fleetImages: ["new"] },
    options: { new: true, runValidators: true },
  });
  assert.equal(result._id, "f");
});

test("generic admin lifecycle mutation is rejected before storage or persistence", async () => {
  let storageCalled = false;
  let persistenceCalled = false;
  const service = createFleetUpdateService({
    Bus: {
      findByIdAndUpdate() {
        persistenceCalled = true;
      },
    },
    policy: {
      rejectLifecycleUpdate: () => {
        const error = new Error("dedicated endpoint required");
        error.code = "FLEET_LIFECYCLE_UPDATE_FORBIDDEN";
        throw error;
      },
    },
    repository: { findDocument: async () => ({ _id: "f", approvalStatus: "DRAFT" }) },
    storage: { replaceFleetImages: async () => { storageCalled = true; } },
    mapper: { withPresignedUrls: async (fleet) => fleet },
  });

  await assert.rejects(
    service.updateFleetDetails("f", { approvalStatus: "APPROVED" }, {}, null),
    (error) => error.code === "FLEET_LIFECYCLE_UPDATE_FORBIDDEN"
  );
  assert.equal(storageCalled, false);
  assert.equal(persistenceCalled, false);
});

test("generic admin updates cannot modify a fleet while its submission is under review", async () => {
  const service = createFleetUpdateService({
    Bus: {},
    policy: {},
    repository: { findDocument: async () => ({ _id: "f", approvalStatus: "PENDING" }) },
    storage: {},
    mapper: {},
  });
  await assert.rejects(
    service.updateFleetDetails("f", { busName: "Changed during review" }, {}, null),
    (error) => error.code === "FLEET_MUTATION_LOCKED" && error.statusCode === 409
  );
});

test("admin fleet updates validate a replacement brand against the fleet owner", async () => {
  const events = [];
  const policy = {
    rejectLifecycleUpdate: () => events.push("lifecycle"),
    restrictAdminUpdate: () => events.push("restrict-admin"),
    lockApprovedIdentity: () => events.push("lock"),
    validateIdentityUpdate: () => events.push("identity"),
    normalizeBusNumber: async () => events.push("number"),
    verifySeatLayout: async () => events.push("layout"),
    parseCatalogAndReviews: () => events.push("parse"),
  };
  const service = createFleetUpdateService({
    Bus: { findByIdAndUpdate: () => ({ lean: async () => ({}) }) },
    policy,
    repository: { findDocument: async () => ({ _id: "f", ownerId: "owner-1", approvalStatus: "DRAFT" }) },
    storage: { replaceFleetImages: async () => null },
    mapper: { withPresignedUrls: async (fleet) => fleet },
    validateBrand: async (brandId, ownerId) => events.push(`brand:${brandId}:${ownerId}`),
  });

  await service.updateFleetDetails("f", { brandId: "brand-1" }, {}, null);
  assert.deepEqual(events.slice(0, 5), [
    "lifecycle", "restrict-admin", "lock", "identity", "brand:brand-1:owner-1",
  ]);
});
