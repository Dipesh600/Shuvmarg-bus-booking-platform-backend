"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Template = require("../../models/seatLayoutTemplateModel");
const Revision = require("../../models/seatLayoutRevisionModel");
const Assignment = require("../../models/fleetSeatLayoutAssignmentModel");
const ChangeRequest = require("../../models/fleetSeatLayoutChangeRequestModel");
const Snapshot = require("../../models/tripSeatLayoutSnapshotModel");
const fixtures = require("../fixtures/seat-layout-v3.fixtures");

test("template scope enforces platform/operator ownership", async () => {
  await assert.rejects(new Template({
    templateCode: "GLOBAL-1", name: "Global", scope: "PLATFORM", ownerId: "507f1f77bcf86cd799439011",
    vehicleCategory: "BUS", createdByType: "SUPER_ADMIN", createdById: "507f1f77bcf86cd799439012",
  }).validate(), /cannot have an operator owner/);
});

test("revision model derives trusted totals and fingerprint", async () => {
  const revision = new Revision({
    templateId: "507f1f77bcf86cd799439011", revisionNumber: 1,
    layout: fixtures.seaterWithUpperBerths(), totalPlaces: 999, physicalFingerprint: "wrong",
    createdByType: "SUPER_ADMIN", createdById: "507f1f77bcf86cd799439012",
  });
  await revision.validate();
  assert.equal(revision.totalPlaces, 34);
  assert.match(revision.physicalFingerprint, /^[a-f0-9]{64}$/);
});

test("critical persistence identities are uniquely indexed", () => {
  const indexes = (model) => model.schema.indexes().map(([fields, options]) => ({ fields, options }));
  assert.ok(indexes(Revision).some(({ fields, options }) => fields.templateId === 1
    && fields.revisionNumber === 1 && options.unique));
  assert.equal(Assignment.schema.path("fleetId").options.unique, true);
  assert.ok(indexes(ChangeRequest).some(({ fields, options }) => fields.fleetId === 1
    && fields.status === 1 && options.unique && options.partialFilterExpression.status === "PENDING"));
  assert.equal(Snapshot.schema.path("tripId").options.unique, true);
});

test("published physical and trip snapshot fields are immutable", () => {
  ["templateId", "revisionNumber", "layout", "physicalFingerprint", "totalPlaces"]
    .forEach((path) => assert.equal(Revision.schema.path(path).options.immutable, true));
  ["layout", "physicalFingerprint", "sourceAssignmentVersion"]
    .forEach((path) => assert.equal(Snapshot.schema.path(path).options.immutable, true));
});

test("append-only records reject destructive model operations before database access", async () => {
  await assert.rejects(
    Snapshot.deleteOne({ tripId: "507f1f77bcf86cd799439011" }),
    (error) => error.code === "APPEND_ONLY_RECORD"
  );
  await assert.rejects(
    Revision.updateOne(
      { _id: "507f1f77bcf86cd799439011" }, { $set: { layout: fixtures.miniBus() } }
    ),
    (error) => error.code === "APPEND_ONLY_RECORD"
  );
});
