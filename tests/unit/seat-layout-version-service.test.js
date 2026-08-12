"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createVersionService } = require("../../services/seatLayoutVersionService");

const layout = {
  busShape: "SINGLE_DECKER",
  floors: [{ floorIndex: 0, rows: [{ rowIndex: 0, cells: [{
    colIndex: 0, cellType: "SEAT", seatId: "S1", seatLabel: "1", seatType: "STANDARD",
  }] }] }],
};

test("fleet revisions reuse an identical immutable version without publishing the template", async () => {
  const existing = { _id: "version-1", seatConfig: layout, totalSeats: 1 };
  let creates = 0;
  let templateWrites = 0;
  const service = createVersionService({
    Template: {
      findById: async () => ({ _id: "template-1" }),
      findByIdAndUpdate: async () => { templateWrites += 1; },
    },
    Version: {
      findOne: async (query) => query.fingerprint ? existing : null,
      create: async () => { creates += 1; },
    },
  });
  const result = await service.createVersion("template-1", layout, {
    reuseExisting: true,
    publishTemplate: false,
  });
  assert.equal(result, existing);
  assert.equal(creates, 0);
  assert.equal(templateWrites, 0);
});
