"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { resolveAdminActor } = require("../../../src/modules/fleet/document-lifecycle/fleet-document-actor.resolver");

test("fleet-document-admin-authorization unit tests", async (t) => {
  const validAdminId = "64f000000000000000000099";

  await t.test("delegates fresh verification to resolveAuthorizedAdminActor", async () => {
    let passedAuthInfo = null;
    const resolverMock = async (authInfo) => {
      passedAuthInfo = authInfo;
      return { _id: validAdminId, role: "ADMIN", isActive: true };
    };

    const actor = await resolveAdminActor({ id: validAdminId, role: "ADMIN" }, resolverMock);
    assert.equal(passedAuthInfo.adminId, validAdminId);
    assert.equal(actor.actorType, "ADMIN");
    assert.equal(String(actor.actorId), validAdminId);
  });

  await t.test("re-throws 403 or 401 when resolveAuthorizedAdminActor rejects", async () => {
    const lockErr = new Error("Admin account is locked.");
    lockErr.statusCode = 403;
    lockErr.code = "ADMIN_LOCKED";

    const resolverMock = async () => { throw lockErr; };
    await assert.rejects(
      async () => resolveAdminActor({ id: validAdminId, role: "ADMIN" }, resolverMock),
      (err) => err === lockErr
    );
  });
});
