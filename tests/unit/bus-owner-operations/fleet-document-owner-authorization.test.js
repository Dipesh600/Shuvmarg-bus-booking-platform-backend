"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { resolveBusOwnerActor } = require("../../../src/modules/fleet/document-lifecycle/fleet-document-actor.resolver");

test("fleet-document-owner-authorization unit tests", async (t) => {
  const validOwnerId = "64f000000000000000000001";
  const validUserId = "64f000000000000000000002";

  await t.test("missing userInfo throws 403 authentication required", async () => {
    await assert.rejects(
      async () => resolveBusOwnerActor(null, {}),
      (err) => err.statusCode === 403 && err.code === "FLEET_DOCUMENT_FORBIDDEN"
    );
  });

  await t.test("non-busOwner role throws 403", async () => {
    await assert.rejects(
      async () => resolveBusOwnerActor({ id: validUserId, role: "passenger" }, {}),
      (err) => err.statusCode === 403 && err.code === "FLEET_DOCUMENT_FORBIDDEN"
    );
  });

  await t.test("missing BusOwner profile throws 404", async () => {
    const repo = { findBusOwnerForActor: async () => null };
    await assert.rejects(
      async () => resolveBusOwnerActor({ id: validUserId, role: "busOwner" }, repo),
      (err) => err.statusCode === 404 && err.code === "FLEET_DOCUMENT_NOT_FOUND"
    );
  });

  await t.test("valid BusOwner profile resolves normalized actor", async () => {
    const repo = { findBusOwnerForActor: async () => ({ _id: validOwnerId, verificationStatus: "approved" }) };
    const actor = await resolveBusOwnerActor({ id: validUserId, role: "busOwner" }, repo);
    assert.equal(actor.actorType, "BUS_OWNER");
    assert.equal(String(actor.actorId), validOwnerId);
    assert.equal(actor.userId, validUserId);
  });
});
