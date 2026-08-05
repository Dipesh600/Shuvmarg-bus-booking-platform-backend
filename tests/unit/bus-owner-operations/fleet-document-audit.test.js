"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const builder = require("../../../src/modules/fleet/document-lifecycle/fleet-document-audit.builder");

test("fleet-document-audit unit tests", async (t) => {
  const actor = { actorType: "BUS_OWNER", actorId: "64f000000000000000000001" };

  await t.test("buildDocumentAuditEvent constructs audit event without objectKey or url", () => {
    const event = builder.buildDocumentAuditEvent({
      action: "RESUBMITTED",
      actor,
      slot: "insurance",
      previousFleetApprovalStatus: "REJECTED",
      resultingFleetApprovalStatus: "PENDING",
      reason: "Corrected policy number",
    });

    assert.equal(event.eventType, "FLEET_DOCUMENT_RESUBMITTED");
    assert.equal(event.actorType, "BUS_OWNER");
    assert.equal(event.documentSlot, "insurance");
    assert.equal(event.action, "RESUBMITTED");
    assert.equal(event.reason, "Corrected policy number");
    assert.equal(event.objectKey, undefined);
    assert.equal(event.url, undefined);
  });

  await t.test("fleetImages slot produces FLEET_IMAGES_UPDATED eventType for REPLACED action", () => {
    const event = builder.buildDocumentAuditEvent({
      action: "REPLACED",
      actor,
      slot: "fleetImages",
      previousFleetApprovalStatus: "PENDING",
      resultingFleetApprovalStatus: "PENDING",
      reason: "Updating bus photos",
    });

    assert.equal(event.eventType, "FLEET_IMAGES_UPDATED");
  });
});
