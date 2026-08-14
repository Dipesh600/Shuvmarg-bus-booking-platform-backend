"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { validateSeatLayoutV3 } = require("../../src/domain/seat-layout-v3");
const { createSeatLayoutTemplateService } = require("../../src/modules/seat-layout-v3-persistence/seat-layout-template.service");
const {
  MAX_SEAT_LAYOUT_REQUEST_BYTES, rejectOversizedSeatLayoutRequest,
} = require("../../middleware/seatLayoutCreationProtection");
const fixtures = require("../fixtures/seat-layout-v3.fixtures");

const admin = { id: "admin-1", type: "SUPER_ADMIN" };

function largePassengerLayout(count) {
  const sections = Array.from({ length: 4 }, (_, sectionIndex) => ({
    sectionId: `section-${sectionIndex}`, name: `Section ${sectionIndex}`,
    role: sectionIndex ? "UPPER_DECK" : "LOWER_CABIN", order: sectionIndex,
    widthUnits: 10, heightUnits: 40, elements: [],
  }));
  for (let index = 0; index < count; index += 1) {
    const section = sections[Math.floor(index / 100)];
    const local = index % 100;
    section.elements.push(fixtures.passenger(
      `seat-${index}`, "SEAT", `S${index + 1}`, local % 10, Math.floor(local / 10)
    ));
  }
  return fixtures.layout("BUS", sections.filter((section) => section.elements.length));
}

test("rejects layouts that exceed the passenger-place complexity cap", () => {
  assert.throws(
    () => validateSeatLayoutV3(largePassengerLayout(101)),
    (error) => error.code === "SEAT_LAYOUT_V3_INVALID"
      && /at most 100 passenger places/.test(error.message)
  );
});

test("accepts the maximum supported passenger-place count", () => {
  assert.equal(validateSeatLayoutV3(largePassengerLayout(100)).totalPlaces, 100);
});

test("platform template codes are allocated by the server and ignore caller input", async () => {
  let allocationCategory;
  let persisted;
  const service = createSeatLayoutTemplateService({
    allocateTemplateCode: async (category) => {
      allocationCategory = category;
      return "BUS-0042";
    },
    createTemplate: async (data) => { persisted = data; return data; },
  });
  const result = await service.createTemplate({
    scope: "PLATFORM", templateCode: "../../root", name: "Standard", vehicleCategory: "BUS",
  }, admin);
  assert.equal(allocationCategory, "BUS");
  assert.equal(persisted.templateCode, "BUS-0042");
  assert.equal(result.templateCode, "BUS-0042");
});

test("invalid vehicle categories are rejected before registry code allocation", async () => {
  let allocated = false;
  const service = createSeatLayoutTemplateService({
    allocateTemplateCode: async () => { allocated = true; },
  });
  await assert.rejects(
    service.createTemplate({ scope: "PLATFORM", name: "Standard", vehicleCategory: "../../BUS" }, admin),
    (error) => error.code === "SEAT_LAYOUT_INPUT_INVALID" && error.details.field === "vehicleCategory"
  );
  assert.equal(allocated, false);
});

test("revision creation delegates one atomic allocation-and-insert operation", async () => {
  let command;
  const service = createSeatLayoutTemplateService({
    findTemplate: async () => ({ _id: "template-1", scope: "PLATFORM", status: "ACTIVE" }),
    createRevisionAtomic: async (data, actor) => { command = { data, actor }; return data; },
  });
  await service.createRevision("template-1", { layout: fixtures.standard2x2(), changeSummary: "Initial layout" }, admin);
  assert.equal(command.data.revisionNumber, undefined);
  assert.equal(command.data.templateId, "template-1");
  assert.equal(command.actor, admin);
});

test("oversized creation requests are rejected before controller execution", () => {
  const req = { headers: { "content-length": String(MAX_SEAT_LAYOUT_REQUEST_BYTES + 1) } };
  let nextCalled = false;
  let statusCode;
  let body;
  const res = { status(code) { statusCode = code; return this; }, json(value) { body = value; return this; } };
  rejectOversizedSeatLayoutRequest(req, res, () => { nextCalled = true; });
  assert.equal(statusCode, 413);
  assert.equal(body.errorCode, "SEAT_LAYOUT_REQUEST_TOO_LARGE");
  assert.equal(nextCalled, false);
});
