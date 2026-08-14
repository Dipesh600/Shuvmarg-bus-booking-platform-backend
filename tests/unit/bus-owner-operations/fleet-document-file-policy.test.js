"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const policy = require("../../../src/modules/fleet/document-lifecycle/fleet-document-file.policy");

test("fleet-document-file-policy unit tests", async (t) => {
  const pdfBuffer = Buffer.from("%PDF-1.4 header contents");
  const jpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
  const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
  const webpBuffer = Buffer.from([
    0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00,
    0x57, 0x45, 0x42, 0x50,
  ]);

  await t.test("accepts valid PDF for legal document", () => {
    const file = { name: "doc.pdf", mimetype: "application/pdf", data: pdfBuffer, size: 100 };
    const res = policy.validateSingleFile(file, "fitnessCert");
    assert.equal(res.extension, "pdf");
    assert.equal(res.mimeType, "application/pdf");
  });

  await t.test("accepts valid JPEG for fleetImages", () => {
    const file = { name: "img.jpg", mimetype: "image/jpeg", data: jpegBuffer, size: 100 };
    const res = policy.validateSingleFile(file, "fleetImages");
    assert.equal(res.extension, "jpeg");
  });

  await t.test("accepts processed WebP for legal document images", () => {
    const file = { name: "img.webp", mimetype: "image/webp", data: webpBuffer, size: 100 };
    assert.equal(policy.validateSingleFile(file, "insurance").mimeType, "image/webp");
  });

  await t.test("rejects file with signature mismatch", () => {
    const file = { name: "doc.pdf", mimetype: "application/pdf", data: jpegBuffer, size: 100 };
    assert.throws(
      () => policy.validateSingleFile(file, "fitnessCert"),
      (err) => err.code === "FLEET_DOCUMENT_SIGNATURE_MISMATCH"
    );
  });

  await t.test("rejects oversized file", () => {
    const file = { name: "doc.pdf", mimetype: "application/pdf", data: pdfBuffer, size: 9 * 1024 * 1024 };
    assert.throws(
      () => policy.validateSingleFile(file, "fitnessCert"),
      (err) => err.code === "FLEET_DOCUMENT_FILE_TOO_LARGE"
    );
  });
});
