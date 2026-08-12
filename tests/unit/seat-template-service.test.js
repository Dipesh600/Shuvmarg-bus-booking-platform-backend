"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createSeatTemplateService } = require("../../services/seatTemplateService");

const layout = (label = "1") => ({
  busShape: "SINGLE_DECKER",
  floors: [{ floorIndex: 0, rows: [{ rowIndex: 0, cells: [{
    colIndex: 0, cellType: "SEAT", seatId: `S${label}`,
    seatLabel: label, seatType: "STANDARD",
  }] }] }],
});

function serviceFixture(referenceCount = 0) {
  let document = null;
  const model = {
    create: async (data) => { document = { _id: "t1", ...data }; return document; },
    findById: async () => document,
    findOne: async () => document,
    findByIdAndUpdate: async (_id, update) => { document = { ...document, ...update }; return document; },
    findByIdAndDelete: async () => { const old = document; document = null; return old; },
  };
  const references = {
    assertUnreferenced: async () => {
      if (referenceCount) {
        const error = new Error("in use"); error.code = "SEAT_TEMPLATE_IN_USE"; throw error;
      }
    },
  };
  const versions = {
    createVersion: async (_id, seatConfig) => {
      document.currentVersionId = "v1";
      document.seatConfig = seatConfig;
      document.totalSeats = 1;
      return { _id: "v1", versionNumber: 1 };
    },
  };
  return {
    service: createSeatTemplateService({ SeatTemplateModel: model, references, versions }),
    model,
  };
}

test("template creation derives capacity and trims its name", async () => {
  const { service } = serviceFixture();
  const result = await service.createTemplate({ templateName: " Standard ", seatConfig: layout() }, "admin");
  assert.equal(result.templateName, "Standard");
  assert.equal(result.totalSeats, 1);
});

test("unreferenced structural changes create a new immutable version", async () => {
  const { service } = serviceFixture();
  await service.createTemplate({ templateName: "Standard", seatConfig: layout() }, "admin");
  const changed = await service.updateTemplate("t1", { seatConfig: layout("2") });
  assert.equal(changed.seatConfig.floors[0].rows[0].cells[0].seatLabel, "2");
});

test("global templates can be derived into operator-owned copies", async () => {
  const { service } = serviceFixture();
  const base = await service.createTemplate({
    templateName: "Global 2x2", scope: "GLOBAL", seatConfig: layout(),
  }, "admin");
  const derived = await service.deriveTemplate(base._id, { templateName: "Owner layout" }, "owner", "admin");
  assert.equal(derived.scope, "OPERATOR");
  assert.equal(derived.userId, "owner");
  assert.equal(derived.baseTemplateId, "t1");
});

test("referenced templates cannot change structure or be deleted", async () => {
  const { service } = serviceFixture(1);
  await service.createTemplate({ templateName: "Standard", seatConfig: layout() }, "admin");
  await assert.rejects(() => service.updateTemplate("t1", { seatConfig: layout("2") }), /in use/);
  await assert.rejects(() => service.deleteTemplate("t1"), /in use/);
  const renamed = await service.updateTemplate("t1", { templateName: "Renamed", isActive: false });
  assert.equal(renamed.templateName, "Renamed");
  assert.equal(renamed.isActive, false);
});
