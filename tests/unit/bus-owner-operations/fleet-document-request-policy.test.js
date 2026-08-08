"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const policy = require("../../../src/modules/fleet/document-lifecycle/fleet-document-request.policy");

test("fleet-document-request-policy unit tests", async (t) => {
  await t.test("validateFleetId rejects invalid ObjectId", () => {
    assert.throws(() => policy.validateFleetId("invalid-id"), (err) => err.code === "FLEET_DOCUMENT_INVALID_METADATA");
    assert.throws(() => policy.validateFleetId(null), (err) => err.code === "FLEET_DOCUMENT_INVALID_METADATA");
    assert.doesNotThrow(() => policy.validateFleetId("64f000000000000000000001"));
  });

  await t.test("validateSlot rejects unknown slots and aliases", () => {
    assert.throws(() => policy.validateSlot("fitness"), (err) => err.code === "FLEET_DOCUMENT_INVALID_SLOT");
    assert.throws(() => policy.validateSlot("blueBook"), (err) => err.code === "FLEET_DOCUMENT_INVALID_SLOT");
    assert.throws(() => policy.validateSlot("route_permit"), (err) => err.code === "FLEET_DOCUMENT_INVALID_SLOT");
    assert.doesNotThrow(() => policy.validateSlot("fitnessCert"));
    assert.doesNotThrow(() => policy.validateSlot("fleetImages"));
  });

  await t.test("rejectPrivilegedAndUnknownFields rejects privileged fields", () => {
    assert.throws(
      () => policy.rejectPrivilegedAndUnknownFields({ url: "http://evil.com" }, "fitnessCert"),
      (err) => err.code === "FLEET_DOCUMENT_INVALID_METADATA"
    );
    assert.throws(
      () => policy.rejectPrivilegedAndUnknownFields({ objectKey: "keys/key" }, "fitnessCert"),
      (err) => err.code === "FLEET_DOCUMENT_INVALID_METADATA"
    );
    assert.throws(
      () => policy.rejectPrivilegedAndUnknownFields({ approvalStatus: "APPROVED" }, "fitnessCert"),
      (err) => err.code === "FLEET_DOCUMENT_INVALID_METADATA"
    );
  });

  await t.test("rejectPrivilegedAndUnknownFields rejects unpermitted metadata for slot", () => {
    assert.throws(
      () => policy.rejectPrivilegedAndUnknownFields({ policyNumber: "123" }, "fitnessCert"),
      (err) => err.code === "FLEET_DOCUMENT_INVALID_METADATA"
    );
    assert.doesNotThrow(() => policy.rejectPrivilegedAndUnknownFields({ validTill: "2027-01-01" }, "fitnessCert"));
  });

  await t.test("validateChangeReason validates boundaries", () => {
    assert.equal(policy.validateChangeReason(null, false), null);
    assert.throws(() => policy.validateChangeReason(null, true), (err) => err.code === "FLEET_DOCUMENT_REASON_REQUIRED");
    assert.throws(() => policy.validateChangeReason("  sh  ", true), (err) => err.code === "FLEET_DOCUMENT_REASON_REQUIRED");
    assert.equal(policy.validateChangeReason("  Valid reason for change  ", true), "Valid reason for change");
  });
});
