"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { assertCanReadBusOwnerKycDocument } = require("../../../src/modules/bus-owner/kyc-document-read/kyc-document-read.policy");
const { getKycDocumentReadActor } = require("../../../src/modules/bus-owner/kyc-document-read/kyc-document-read-actor");

test("kyc-document-read-policy unit tests", async (t) => {
  const mockOwner = {
    _id: "64f000000000000000000001",
    user: "64f000000000000000000002",
  };

  await t.test("Owner can read their own stored KYC document", () => {
    const actor = { type: "BUS_OWNER", userId: "64f000000000000000000002" };
    assert.doesNotThrow(() => assertCanReadBusOwnerKycDocument({ actor, busOwner: mockOwner }));
  });

  await t.test("Owner cannot read another owner's document", () => {
    const actor = { type: "BUS_OWNER", userId: "64f000000000000000000099" };
    assert.throws(
      () => assertCanReadBusOwnerKycDocument({ actor, busOwner: mockOwner }),
      (err) => err.code === "KYC_DOCUMENT_READ_FORBIDDEN" && err.statusCode === 403
    );
  });

  await t.test("Admin can read a bus-owner document", () => {
    const actor = { type: "ADMIN", userId: "admin-123" };
    assert.doesNotThrow(() => assertCanReadBusOwnerKycDocument({ actor, busOwner: mockOwner }));
  });

  await t.test("Ordinary user cannot gain admin access using body role", () => {
    const req = {
      userInfo: { id: "user-123", role: "passenger" },
      body: { role: "admin" },
    };
    const actor = getKycDocumentReadActor(req);
    assert.equal(actor.type, "BUS_OWNER");
    assert.throws(
      () => assertCanReadBusOwnerKycDocument({ actor, busOwner: mockOwner }),
      (err) => err.statusCode === 403
    );
  });

  await t.test("Missing authentication is rejected", () => {
    assert.throws(
      () => assertCanReadBusOwnerKycDocument({ actor: null, busOwner: mockOwner }),
      (err) => err.code === "KYC_DOCUMENT_READ_UNAUTHORIZED" && err.statusCode === 401
    );
  });
});
