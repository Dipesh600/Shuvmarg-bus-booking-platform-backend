"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { validateSlotMetadata } = require("../../../src/modules/fleet/document-lifecycle/fleet-document-request.policy");

const futureDate = () => {
  const date = new Date();
  date.setFullYear(date.getFullYear() + 1);
  return date.toISOString().slice(0, 10);
};

test("required fleet document metadata cannot be omitted", () => {
  assert.throws(() => validateSlotMetadata("fitnessCert", {}), /required/i);
  assert.throws(() => validateSlotMetadata("insurance", {}), /policyNumber/i);
  assert.throws(() => validateSlotMetadata("routePermit", {}), /required/i);
});

test("insurance preserves the submitted policy number and expiry", () => {
  const validTill = futureDate();
  const metadata = validateSlotMetadata("insurance", { policyNumber: " POL-9087 ", validTill });
  assert.equal(metadata.policyNumber, "POL-9087");
  assert.equal(metadata.validTill.toISOString().slice(0, 10), validTill);
});

test("expired document dates are rejected", () => {
  assert.throws(
    () => validateSlotMetadata("routePermit", { validTill: "2020-01-01" }),
    /past/i
  );
});
