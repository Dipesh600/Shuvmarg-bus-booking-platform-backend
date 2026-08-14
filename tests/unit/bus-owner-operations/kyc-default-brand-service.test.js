"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createDefaultBrandService, normalizeBrandName } = require("../../../src/modules/bus-owner/kyc-review/kyc-default-brand.service");

function createBrandModel(store, { duplicate = false } = {}) {
  function Brand(data) {
    Object.assign(this, data); this._id = "brand_new"; this.brandCode = "OB-KTM001";
    this.save = async () => { if (duplicate) { const error = new Error("E11000"); error.code = 11000; throw error; } store.push(this); return this; };
  }
  Brand.findOne = (query) => ({ lean: async () => store.find((brand) => brand.ownerId === query.ownerId && brand.isDefault === query.isDefault) || null });
  return Brand;
}

test("normalizeBrandName trims and collapses whitespace", () => {
  assert.equal(normalizeBrandName("  Himalayan   Express  Pvt Ltd  "), "himalayan express pvt ltd");
  assert.equal(normalizeBrandName(null), "");
});

test("ensureDefaultBrand creates a verified active KYC default", async () => {
  const store = []; const service = createDefaultBrandService({ OperatorBrand: createBrandModel(store), clock: () => new Date("2026-08-14T00:00:00Z") });
  const result = await service.ensureDefaultBrand({ ownerId: "owner", companyName: "Himalayan Travels Pvt. Ltd.", adminId: "admin" });
  assert.equal(result.isNew, true); assert.equal(result.brand.normalizedName, "himalayan travels pvt. ltd.");
  assert.equal(result.brand.isDefault, true); assert.equal(result.brand.status, "ACTIVE"); assert.equal(result.brand.source, "KYC_APPROVAL");
});

test("ensureDefaultBrand returns an existing default without duplication", async () => {
  const store = [{ _id: "existing", ownerId: "owner", isDefault: true, brandName: "Himalayan" }];
  const result = await createDefaultBrandService({ OperatorBrand: createBrandModel(store) }).ensureDefaultBrand({ ownerId: "owner", companyName: "Himalayan", adminId: "admin" });
  assert.equal(result.isNew, false); assert.equal(result.brand._id, "existing"); assert.equal(store.length, 1);
});

test("ensureDefaultBrand recovers the concurrently-created default", async () => {
  const store = [{ _id: "winner", ownerId: "owner", isDefault: true }];
  const result = await createDefaultBrandService({ OperatorBrand: createBrandModel(store, { duplicate: true }) }).ensureDefaultBrand({ ownerId: "owner", companyName: "Himalayan", adminId: "admin" });
  assert.equal(result.isNew, false); assert.equal(result.brand._id, "winner");
});
