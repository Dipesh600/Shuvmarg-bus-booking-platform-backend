"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const policy = require("../../../src/modules/fleet/document-lifecycle/fleet-document-approval.policy");

test("fleet-document-review-reset unit tests", async (t) => {
  const actor = { actorType: "BUS_OWNER", actorId: "64f000000000000000000001" };
  const auditEvent = { occurredAt: new Date("2026-08-05T12:00:00Z") };

  await t.test("resubmitting rejected slot resets documentReviews and moves fleet to PENDING & INACTIVE", () => {
    const fleet = {
      approvalStatus: "REJECTED",
      status: "INACTIVE",
      documentReviews: { insurance: { status: "rejected", reason: "Expired" } },
    };

    const update = policy.buildUpdateQuery({
      fleet,
      slot: "insurance",
      actor,
      metadata: { validTill: new Date("2027-01-01") },
      newAssets: [{ objectKey: "new-key", mimeType: "application/pdf", size: 100 }],
      auditEvent,
    });

    assert.equal(update.$set.approvalStatus, "PENDING");
    assert.equal(update.$set.status, "INACTIVE");
    assert.equal(update.$set.rejectionReason, null);
    assert.deepEqual(update.$set["documentReviews.insurance"], {
      status: "pending",
      reason: null,
      reviewedBy: null,
      reviewedAt: null,
    });
    assert.equal(update.$push.approvalAuditHistory.eventType, "FLEET_RESUBMITTED");
  });

  await t.test("replacing slot on PENDING fleet resets documentReviews without changing fleet approvalStatus", () => {
    const fleet = { approvalStatus: "PENDING", status: "INACTIVE" };
    const update = policy.buildUpdateQuery({
      fleet,
      slot: "bluebook",
      actor,
      metadata: {},
      newAssets: [{ objectKey: "new-key", mimeType: "application/pdf", size: 100 }],
      auditEvent,
    });

    assert.equal(update.$set.approvalStatus, undefined);
    assert.deepEqual(update.$set["documentReviews.bluebook"], {
      status: "pending",
      reason: null,
      reviewedBy: null,
      reviewedAt: null,
    });
  });
});
