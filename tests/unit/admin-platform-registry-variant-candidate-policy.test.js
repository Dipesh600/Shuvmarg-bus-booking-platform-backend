"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const Stop = require("../../models/stopModel.js");
const {
  MAX_EXISTING_STOP_DISTANCE_METERS,
  resolveEligibleStop,
  resolveEligibleStops,
} = require("../../src/modules/admin/platform-registry/variant-draft-workflow/candidate-policy.service.js");
const {
  STOP_REFERENCE_FIELDS,
} = require("../../src/modules/admin/platform-registry/variant-draft-workflow/context.service.js");

function patch(t, object, key, value) {
  const original = object[key];
  object[key] = value;
  t.after(() => { object[key] = original; });
}

function canonicalStop(coordinates) {
  return {
    _id: new mongoose.Types.ObjectId(), status: "ACTIVE",
    verificationStatus: "VERIFIED", isRouteStop: true, coordinates,
  };
}

test("candidate stop projection includes every field used by eligibility policy", () => {
  const projectedFields = new Set(STOP_REFERENCE_FIELDS.split(/\s+/));
  assert.equal(projectedFields.has("status"), true);
  assert.equal(projectedFields.has("verificationStatus"), true);
  assert.equal(projectedFields.has("isRouteStop"), true);
  assert.equal(projectedFields.has("coordinates"), true);
});

test("candidate review only accepts an existing stop near the reviewed map location", async (t) => {
  const near = canonicalStop({ lat: 27.7001, lng: 85.3001 });
  patch(t, Stop, "findById", () => ({ select: async () => near }));
  await assert.doesNotReject(resolveEligibleStop(String(near._id), { lat: 27.7, lng: 85.3 }));
});

test("candidate review rejects a remote existing stop", async (t) => {
  const far = canonicalStop({ lat: 27.7, lng: 86.3 });
  patch(t, Stop, "findById", () => ({ select: async () => far }));
  await assert.rejects(
    resolveEligibleStop(String(far._id), { lat: 27.7, lng: 85.3 }),
    (error) => error.code === "ROUTE_STOP_OUTSIDE_CANDIDATE_AREA" &&
      error.details.maxDistanceMeters === MAX_EXISTING_STOP_DISTANCE_METERS
  );
});

test("route commit validates many existing stops with one session-bound query", async (t) => {
  const first = canonicalStop({ lat: 27.7, lng: 85.3 });
  const second = canonicalStop({ lat: 27.71, lng: 85.31 });
  const session = { id: "commit-session" };
  let findCalls = 0;
  let receivedSession;
  patch(t, Stop, "find", () => {
    findCalls += 1;
    return {
      select() { return this; },
      session(value) { receivedSession = value; return Promise.resolve([first, second]); },
    };
  });
  const resolved = await resolveEligibleStops([
    { stopId: String(first._id), coordinates: first.coordinates },
    { stopId: String(second._id), coordinates: second.coordinates },
  ], { session });
  assert.equal(findCalls, 1);
  assert.equal(receivedSession, session);
  assert.deepEqual(resolved, [first, second]);
});
