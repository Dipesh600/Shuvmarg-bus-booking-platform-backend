"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const SeatTemplate = require("../../models/seatTemplateModel");
const {
  validateSeatTemplate,
} = require("../../src/modules/admin/schedule-management/schedule-creation-gates.service");

test("new schedules accept only active seat templates", async (t) => {
  const original = SeatTemplate.findOne;
  t.after(() => { SeatTemplate.findOne = original; });
  let receivedQuery;
  SeatTemplate.findOne = (query) => {
    receivedQuery = query;
    return {
      select() { return this; },
      async lean() { return { _id: "template", isActive: true }; },
    };
  };
  await validateSeatTemplate("template");
  assert.deepEqual(receivedQuery, { _id: "template", isActive: true });
  SeatTemplate.findOne = () => ({
    select() { return this; }, async lean() { return null; },
  });
  await assert.rejects(() => validateSeatTemplate("template"), /missing or inactive/);
});
