"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { buildKycAuditEvent, KycAuditError } = require("../../../src/modules/bus-owner/kyc-audit");

test("kyc-audit-event-builder unit tests", async (t) => {
  const validActorId = "64f000000000000000000001";
  const validDate = new Date("2026-08-05T12:00:00Z");

  await t.test("accepts valid submission event and does not mutate input", async () => {
    const input = {
      eventType: "KYC_SUBMITTED",
      actorType: "BUS_OWNER",
      actorId: validActorId,
      fromStatus: null,
      toStatus: "pending",
      occurredAt: validDate,
      metadata: { documentCount: 3 },
    };
    const event = buildKycAuditEvent(input);
    assert.equal(event.eventType, "KYC_SUBMITTED");
    assert.equal(event.actorType, "BUS_OWNER");
    assert.equal(event.actorId, validActorId);
    assert.equal(event.fromStatus, null);
    assert.equal(event.toStatus, "pending");
    assert.equal(event.occurredAt.toISOString(), validDate.toISOString());
    assert.deepEqual(event.metadata, { documentCount: 3 });
    assert.notEqual(event, input, "Must return a new plain object");
  });

  await t.test("accepts valid review event", async () => {
    const event = buildKycAuditEvent({
      eventType: "KYC_REJECTED",
      actorType: "ADMIN",
      actorId: validActorId,
      fromStatus: "pending",
      toStatus: "rejected",
      occurredAt: validDate,
      metadata: { invalidDocumentTypes: ["taxRegistration"], reasonProvided: true },
    });
    assert.equal(event.eventType, "KYC_REJECTED");
    assert.equal(event.actorType, "ADMIN");
    assert.deepEqual(event.metadata, { invalidDocumentTypes: ["taxRegistration"], reasonProvided: true });
  });

  await t.test("rejects missing or empty actor ID", async () => {
    for (const actorId of [null, undefined, "", "   "]) {
      await assert.rejects(
        async () => buildKycAuditEvent({ eventType: "KYC_SUBMITTED", actorType: "BUS_OWNER", actorId, toStatus: "pending", occurredAt: validDate, metadata: {} }),
        (err) => err instanceof KycAuditError && err.code === "KYC_AUDIT_INVALID_ACTOR_ID"
      );
    }
  });

  await t.test("rejects unknown event type or actor type", async () => {
    await assert.rejects(
      async () => buildKycAuditEvent({ eventType: "INVALID_EVENT", actorType: "BUS_OWNER", actorId: validActorId, toStatus: "pending", occurredAt: validDate, metadata: {} }),
      (err) => err instanceof KycAuditError && err.code === "KYC_AUDIT_INVALID_EVENT_TYPE"
    );
    await assert.rejects(
      async () => buildKycAuditEvent({ eventType: "KYC_SUBMITTED", actorType: "USER", actorId: validActorId, toStatus: "pending", occurredAt: validDate, metadata: {} }),
      (err) => err instanceof KycAuditError && err.code === "KYC_AUDIT_INVALID_ACTOR_TYPE"
    );
  });

  await t.test("rejects non-integer, negative, NaN or Infinity documentCount", async () => {
    for (const count of [1.5, NaN, Infinity, -1, "3"]) {
      await assert.rejects(
        async () => buildKycAuditEvent({ eventType: "KYC_SUBMITTED", actorType: "BUS_OWNER", actorId: validActorId, toStatus: "pending", occurredAt: validDate, metadata: { documentCount: count } }),
        (err) => err instanceof KycAuditError && err.code === "KYC_AUDIT_INVALID_DOCUMENT_COUNT"
      );
    }
  });

  await t.test("rejects invalid occurredAt Date instance", async () => {
    for (const occurredAt of ["2026-08-05", new Date("invalid date"), null, 1234567]) {
      await assert.rejects(
        async () => buildKycAuditEvent({ eventType: "KYC_SUBMITTED", actorType: "BUS_OWNER", actorId: validActorId, toStatus: "pending", occurredAt, metadata: {} }),
        (err) => err instanceof KycAuditError && err.code === "KYC_AUDIT_INVALID_TIMESTAMP"
      );
    }
  });

  await t.test("rejects unknown metadata fields and does not retain arbitrary payload", async () => {
    await assert.rejects(
      async () => buildKycAuditEvent({ eventType: "KYC_SUBMITTED", actorType: "BUS_OWNER", actorId: validActorId, toStatus: "pending", occurredAt: validDate, metadata: { customKey: "hack" } }),
      (err) => err instanceof KycAuditError && err.code === "KYC_AUDIT_UNSUPPORTED_METADATA"
    );
  });
});
