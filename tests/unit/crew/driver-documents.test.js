"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createDriverDocumentService } = require("../../../src/modules/admin/driver-management/driver-documents.service");
const prefix = "brands/brand/drivers/driver/docs/license";
const response = () => ({ code: 0, headers: {}, setHeader(k, v) { this.headers[k] = v; },
  status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
function fixture(key = prefix + "/scan.pdf", contentType = "application/pdf") {
  let reads = 0; let streamed = false; let requestedKey;
  const service = createDriverDocumentService({ DriverProfile: {
    findById: () => ({ lean: async () => ({ _id: "driver", brandId: "brand", licenseDoc: key }) }),
  }, storage: {
    buildS3Path: () => prefix,
    getObjectFromS3: async value => {
      reads++; requestedKey = value;
      return { ContentType: contentType, Body: { on() {}, pipe() { streamed = true; }, destroy() {} } };
    },
  }, logger: { warn() {} } });
  return { service, result: () => ({ reads, streamed, requestedKey }) };
}
test("preview resolves stored driver evidence and streams privately", async () => {
  const { service, result } = fixture(); const res = response();
  await service.view({ params: { id: "driver", slot: "license" }, query: { key: "other/secret.pdf" } }, res);
  assert.equal(result().requestedKey, prefix + "/scan.pdf"); assert.equal(result().streamed, true);
  assert.equal(res.headers["Cache-Control"], "no-store, private"); assert.equal(res.headers["X-Content-Type-Options"], "nosniff");
});
for (const key of [null, "https://example.com/file.pdf", "brands/other/drivers/driver/docs/license/scan.pdf",
  "brands/brand/drivers/other/docs/license/scan.pdf", prefix + "/../secret.pdf", prefix + "\\secret.pdf"]) {
  test(`preview rejects missing or unscoped key ${key}`, async () => {
    const { service, result } = fixture(key); const res = response();
    await service.view({ params: { id: "driver", slot: "license" } }, res);
    assert.equal(res.code, 404); assert.equal(result().reads, 0);
  });
}
test("invalid document slots cannot select arbitrary driver properties", async () => {
  for (const slot of ["__proto__", "constructor", "userId"]) {
    const { service, result } = fixture(); const res = response();
    await service.view({ params: { id: "driver", slot } }, res);
    assert.equal(res.code, 404); assert.equal(result().reads, 0);
  }
});
test("unsupported active content is not streamed inline", async () => {
  const { service, result } = fixture(undefined, "text/html"); const res = response();
  await service.view({ params: { id: "driver", slot: "license" } }, res);
  assert.equal(res.code, 415); assert.equal(result().streamed, false);
});
test("new routes retain admin or approved-owner authorization and invitation rate limiting", () => {
  const root = path.resolve(__dirname, "../../..");
  const admin = fs.readFileSync(path.join(root, "routes/adminRoutes/adminRoutes.js"), "utf8");
  assert.match(admin, /router.get\("\/drivers\/:id\/documents\/:slot\/view", adminMiddleware, driverController.viewDriverDocument\)/);
  const owner = fs.readFileSync(path.join(root, "routes/busOwner/busOwner.js"), "utf8");
  const guardIndex = owner.indexOf("router.use(requireApprovedBusOwner)");
  assert.ok(guardIndex >= 0 && guardIndex < owner.indexOf('router.put("/conductors/'));
  assert.match(owner, /router.post\("\/assignConductor",\s+crewInviteRateLimit, staffCon.assignConductor\)/);
  assert.match(owner, /router.post\("\/assignDriver",\s+crewInviteRateLimit, driverUploadRateLimiter, rejectOversizedDriverUpload, parseDriverLicenseUpload, staffCon.assignDriver\)/);
});
