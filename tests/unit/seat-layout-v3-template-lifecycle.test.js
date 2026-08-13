"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createSeatLayoutTemplateService } = require("../../src/modules/seat-layout-v3-persistence/seat-layout-template.service");
const { SeatLayoutPersistenceError } = require("../../src/modules/seat-layout-v3-persistence/seat-layout-persistence.error");
const fixtures = require("../fixtures/seat-layout-v3.fixtures");

const admin = { id: "admin-1", type: "SUPER_ADMIN" };
const owner = { id: "owner-1", type: "BUS_OWNER" };

test("only a super admin can create a platform template", async () => {
  const service = createSeatLayoutTemplateService({ createTemplate: async (data) => data });
  await assert.rejects(
    service.createTemplate({ scope: "PLATFORM", vehicleCategory: "BUS", name: "Standard" }, owner),
    (error) => error instanceof SeatLayoutPersistenceError && error.code === "PLATFORM_TEMPLATE_FORBIDDEN"
  );
});

test("operator template ownership follows the acting owner", async () => {
  const service = createSeatLayoutTemplateService({ createTemplate: async (data) => data });
  await assert.rejects(
    service.createTemplate({ scope: "OPERATOR", ownerId: "another", vehicleCategory: "BUS" }, owner),
    (error) => error.code === "OPERATOR_TEMPLATE_FORBIDDEN"
  );
});

test("revision creation allocates a database-backed number and validates V3", async () => {
  const calls = [];
  const service = createSeatLayoutTemplateService({
    findTemplate: async () => ({
      _id: "template-1", scope: "OPERATOR", ownerId: "owner-1",
      status: "ACTIVE", currentPublishedRevisionId: "rev-1",
    }),
    allocateRevisionNumber: async (id) => { calls.push(id); return 2; },
    createRevision: async (data) => data,
  });
  const result = await service.createRevision("template-1", {
    layout: fixtures.seaterWithUpperBerths(), changeSummary: "Add upper berths",
  }, owner);
  assert.deepEqual(calls, ["template-1"]);
  assert.equal(result.revisionNumber, 2);
  assert.equal(result.baseRevisionId, "rev-1");
  assert.equal(result.totalPlaces, 34);
  assert.match(result.physicalFingerprint, /^[a-f0-9]{64}$/);
});

test("archived templates cannot receive revisions", async () => {
  const service = createSeatLayoutTemplateService({ findTemplate: async () => ({ status: "ARCHIVED" }) });
  await assert.rejects(
    service.createRevision("template-1", { layout: fixtures.standard2x2() }, owner),
    (error) => error.code === "SEAT_LAYOUT_TEMPLATE_ARCHIVED"
  );
});

test("owner cannot revise a platform template", async () => {
  const service = createSeatLayoutTemplateService({
    findTemplate: async () => ({ scope: "PLATFORM", status: "ACTIVE" }),
  });
  await assert.rejects(
    service.createRevision("template-1", { layout: fixtures.standard2x2() }, owner),
    (error) => error.code === "SEAT_LAYOUT_TEMPLATE_MODIFY_FORBIDDEN"
  );
});

test("operator draft submission moves only its own revision to review", async () => {
  let command;
  const repository = {
    findTemplate: async () => ({ _id: "template-1", scope: "OPERATOR", ownerId: "owner-1" }),
    findRevision: async () => ({ _id: "rev-2", templateId: "template-1", status: "DRAFT" }),
    submitRevision: async (input) => { command = input; return "submitted"; },
  };
  const result = await createSeatLayoutTemplateService(repository)
    .submitRevision("template-1", "rev-2", owner);
  assert.equal(result, "submitted");
  assert.deepEqual(command, { templateId: "template-1", revisionId: "rev-2", actor: owner });
});

test("operator can adopt only the published revision of a platform template", async () => {
  let command;
  const repository = {
    findTemplate: async () => ({
      _id: "platform-1", scope: "PLATFORM", status: "ACTIVE", name: "Standard",
      currentPublishedRevisionId: "revision-1",
    }),
    findRevision: async () => ({ _id: "revision-1", status: "PUBLISHED" }),
    adoptPlatformTemplate: async (input) => { command = input; return "adopted"; },
  };
  const result = await createSeatLayoutTemplateService(repository).adoptPlatformTemplate(
    "platform-1", { ownerId: "owner-1", templateCode: "OWN-STD" }, owner
  );
  assert.equal(result, "adopted");
  assert.equal(command.sourceRevision._id, "revision-1");
  assert.equal(command.name, "Standard");
});

test("unpublished platform template cannot be adopted", async () => {
  const repository = {
    findTemplate: async () => ({ _id: "platform-1", scope: "PLATFORM", status: "ACTIVE" }),
  };
  await assert.rejects(
    createSeatLayoutTemplateService(repository).adoptPlatformTemplate(
      "platform-1", { ownerId: "owner-1" }, owner
    ),
    (error) => error.code === "SEAT_LAYOUT_SOURCE_NOT_REUSABLE"
  );
});

test("publishing is admin-only and cannot cross template ownership", async () => {
  const repository = {
    findTemplate: async () => ({ _id: "template-1" }),
    findRevision: async () => ({ _id: "rev-1", templateId: "template-2", status: "DRAFT" }),
  };
  const service = createSeatLayoutTemplateService(repository);
  await assert.rejects(
    service.publishRevision("template-1", "rev-1", admin),
    (error) => error.code === "SEAT_LAYOUT_REVISION_TEMPLATE_MISMATCH"
  );
  repository.findRevision = async () => ({ _id: "rev-1", templateId: "template-1", status: "DRAFT" });
  await assert.rejects(
    service.publishRevision("template-1", "rev-1", owner),
    (error) => error.code === "SEAT_LAYOUT_PUBLISH_FORBIDDEN"
  );
});

test("publish delegates one atomic lifecycle operation", async () => {
  let command;
  const repository = {
    findTemplate: async () => ({ _id: "template-1" }),
    findRevision: async () => ({ _id: "rev-2", templateId: "template-1", status: "IN_REVIEW" }),
    publishRevision: async (input) => { command = input; return "published"; },
  };
  const result = await createSeatLayoutTemplateService(repository)
    .publishRevision("template-1", "rev-2", admin);
  assert.equal(result, "published");
  assert.equal(command.actor, admin);
  assert.equal(command.revision._id, "rev-2");
});
