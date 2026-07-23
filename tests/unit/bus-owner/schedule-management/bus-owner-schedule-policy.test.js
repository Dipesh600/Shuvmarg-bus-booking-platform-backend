"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { assertOwnership } = require("../../../../src/modules/bus-owner/schedule-management/bus-owner-schedule.policy");

test("bus-owner schedule ownership policy", async (t) => {
  await t.test("permits access when schedule.operatorId.toString() matches operatorId for object or string IDs", () => {
    const docWithObjId = { operatorId: { toString: () => "op-555" } };
    assert.doesNotThrow(() => assertOwnership(docWithObjId, "op-555", "update"));
    assert.doesNotThrow(() => assertOwnership(docWithObjId, "op-555", "delete"));
    assert.doesNotThrow(() => assertOwnership(docWithObjId, "op-555", "read"));

    const docWithStringId = { operatorId: "op-555" };
    assert.doesNotThrow(() => assertOwnership(docWithStringId, "op-555", "update"));
  });

  await t.test("throws exact distinct forbidden errors when operatorId does not match", () => {
    const doc = { operatorId: { toString: () => "op-555" } };

    assert.throws(
      () => assertOwnership(doc, "other-op", "update"),
      (err) => {
        assert.equal(err.statusCode, 403);
        assert.equal(err.message, "Unauthorized to update this ticket.");
        return true;
      }
    );

    assert.throws(
      () => assertOwnership(doc, "other-op", "delete"),
      (err) => {
        assert.equal(err.statusCode, 403);
        assert.equal(err.message, "Unauthorized to delete this ticket.");
        return true;
      }
    );

    assert.throws(
      () => assertOwnership(doc, "other-op", "read"),
      (err) => {
        assert.equal(err.statusCode, 403);
        assert.equal(err.message, "Unauthorized to get ticket!");
        return true;
      }
    );
  });
});
