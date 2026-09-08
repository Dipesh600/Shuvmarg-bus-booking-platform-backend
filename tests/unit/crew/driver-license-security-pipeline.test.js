"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createDriverDocumentService } = require("../../../src/modules/admin/driver-management/driver-documents.service");

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
const upload = { name: "licence.png", mimetype: "image/png", size: png.length, data: png };
const webp = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBPVP8 ")]);

test("driver uploads force malware scanning even outside production", () => {
  const source = fs.readFileSync(path.join(__dirname,
    "../../../src/modules/admin/driver-management/driver-documents.service.js"), "utf8");
  assert.match(source, /KYC_MALWARE_SCAN_MODE: "required"/);
  assert.match(source, /"127\.0\.0\.1"/);
});

function fixture(overrides = {}) {
  const events = [];
  const service = createDriverDocumentService({
    DriverProfile: {}, logger: { warn() {} },
    malwareScanner: { async scanValidatedFiles() {
      events.push("scan");
      if (overrides.scanError) throw overrides.scanError;
    } },
    fileProcessor: overrides.fileProcessor || (async () => {
      events.push("compress");
      return { name: "licence.webp", mimetype: "image/webp", size: webp.length, data: webp };
    }),
    storage: {
      buildS3Path: () => "brands/brand/drivers/driver/docs/license",
      async uploadFileToS3(file, options) { events.push("store"); return `${options.folder}/${options.objectName}`; },
      async deleteObjectFromS3() {},
    },
  });
  return { service, events };
}

test("driver licence is content-validated, scanned, compressed and only then stored", async () => {
  const { service, events } = fixture();
  const key = await service.uploadLicense({ file: upload, brandId: "brand", driverId: "driver" });
  assert.deepEqual(events, ["scan", "compress", "store"]);
  assert.match(key, /\.webp$/);
});

test("spoofed file metadata is rejected before scan, processing or storage", async () => {
  const { service, events } = fixture();
  await assert.rejects(service.uploadLicense({
    file: { ...upload, name: "licence.pdf", mimetype: "application/pdf" }, brandId: "brand", driverId: "driver",
  }), error => error.code === "KYC_FILE_SIGNATURE_MISMATCH");
  assert.deepEqual(events, []);
});

test("malware scan failure prevents compression and storage", async () => {
  const error = new Error("unsafe"); error.statusCode = 422;
  const { service, events } = fixture({ scanError: error });
  await assert.rejects(service.uploadLicense({ file: upload, brandId: "brand", driverId: "driver" }), /unsafe/);
  assert.deepEqual(events, ["scan"]);
});

test("invalid processed output is never stored", async () => {
  const { service, events } = fixture({ fileProcessor: async () => {
    events.push("compress"); return { name: "bad.webp", mimetype: "image/webp", size: 3, data: Buffer.from("bad") };
  } });
  await assert.rejects(service.uploadLicense({ file: upload, brandId: "brand", driverId: "driver" }), /final security check/);
  assert.deepEqual(events, ["scan", "compress"]);
});
