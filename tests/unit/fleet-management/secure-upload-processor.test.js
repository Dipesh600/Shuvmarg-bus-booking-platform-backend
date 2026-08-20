"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const sharp = require("sharp");
const { processValidatedUpload } = require("../../../src/modules/shared/security/secure-upload-processor");

test("accepted images are rotated, bounded and converted to compressed WebP", async () => {
  const source = await sharp({
    create: { width: 3000, height: 1000, channels: 3, background: "#ff6600" },
  }).png().toBuffer();
  const output = await processValidatedUpload({
    name: "front.png", mimetype: "image/png", data: source, size: source.length,
  });
  const metadata = await sharp(output.data).metadata();
  assert.equal(output.mimetype, "image/webp");
  assert.equal(output.name, "front.webp");
  assert.equal(metadata.format, "webp");
  assert.equal(metadata.width, 2400);
  assert.equal(metadata.height, 800);
  assert.equal(output.size, output.data.length);
});

test("PDF uploads pass through unchanged", async () => {
  const file = { name: "permit.pdf", mimetype: "application/pdf", data: Buffer.from("%PDF"), size: 4 };
  assert.equal(await processValidatedUpload(file), file);
});
