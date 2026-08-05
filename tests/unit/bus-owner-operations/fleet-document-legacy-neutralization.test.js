"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { parseCreationInput } = require("../../../src/modules/fleet-management/fleet-creation.policy");
const { restrictOwnerUpdate } = require("../../../src/modules/fleet-management/fleet-update.policy");
const { isKeyAllowed } = require("../../../src/modules/shared/document-proxy/document-proxy.policy");
const { sanitizeFleetDocumentDescriptors } = require("../../../src/modules/fleet/document-lifecycle/fleet-document.dto");

test("fleet-document-legacy-neutralization unit tests", async (t) => {
  await t.test("parseCreationInput rejects client-supplied fleetDocuments or fleetImages", () => {
    assert.throws(
      () => parseCreationInput({ busName: "Bus", busNumber: "BA1PA1234", busType: "AC", totalSeats: 30, vehicleType: "bus", fleetDocuments: { fitnessCert: { url: "http://evil.com" } } }),
      (err) => err.message.includes("forbidden")
    );
    assert.throws(
      () => parseCreationInput({ busName: "Bus", busNumber: "BA1PA1234", busType: "AC", totalSeats: 30, vehicleType: "bus", fleetImages: ["http://evil.com"] }),
      (err) => err.message.includes("forbidden")
    );
  });

  await t.test("restrictOwnerUpdate strips document, review, and approval fields from update body", () => {
    const body = {
      busName: "New Name",
      fleetDocuments: { fitnessCert: { url: "http://evil.com" } },
      fleetImages: ["http://evil.com"],
      documentReviews: { fitnessCert: { status: "approved" } },
      approvalStatus: "APPROVED",
      status: "ACTIVE",
    };
    restrictOwnerUpdate(body);
    assert.equal(body.busName, "New Name");
    assert.equal(body.fleetDocuments, undefined);
    assert.equal(body.fleetImages, undefined);
    assert.equal(body.documentReviews, undefined);
    assert.equal(body.approvalStatus, undefined);
    assert.equal(body.status, undefined);
  });

  await t.test("document proxy blocks fleet object keys", () => {
    assert.equal(isKeyAllowed("owners/123/brands/b1/fleets/f1/images/img.jpg"), false);
    assert.equal(isKeyAllowed("fleet-documents/f1/fitnessCert/doc.pdf"), false);
    assert.equal(isKeyAllowed("fleet-images/f1/img.jpg"), false);
    assert.equal(isKeyAllowed("owners/123/kyc/citizenship.pdf"), true);
  });

  await t.test("sanitizeFleetDocumentDescriptors strips objectKey and presigned URLs from general DTOs", () => {
    const fleet = {
      fleetDocuments: {
        fitnessCert: { url: "http://s3/key", objectKey: "key", uploadedAt: new Date("2026-08-05") },
      },
      documentReviews: {
        fitnessCert: { status: "approved" },
      },
    };
    const sanitized = sanitizeFleetDocumentDescriptors(fleet);
    assert.deepEqual(sanitized.fleetDocuments.fitnessCert, {
      present: true,
      status: "approved",
      reason: null,
      uploadedAt: "2026-08-05T00:00:00.000Z",
    });
    assert.equal(sanitized.fleetDocuments.fitnessCert.url, undefined);
    assert.equal(sanitized.fleetDocuments.fitnessCert.objectKey, undefined);
  });
});
