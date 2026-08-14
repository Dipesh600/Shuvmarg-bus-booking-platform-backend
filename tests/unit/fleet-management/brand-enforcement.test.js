"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createFleetCreationPolicy } = require("../../../src/modules/fleet-management/fleet-creation.policy");
const { ApiError } = require("../../../src/contracts");
const ownerId = "507f1f77bcf86cd799439011";
const brandId = "507f1f77bcf86cd799439022";
function policy(brands = []) {
  return createFleetCreationPolicy({ Bus: {}, BusAmenities: {}, BoardingPoints: {}, OperatorBrand: { findById: (id) => ({ select: () => ({ lean: async () => brands.find((brand) => String(brand._id) === String(id)) || null }) }) } });
}
async function expectCode(work, code) { await assert.rejects(work, (error) => error instanceof ApiError && error.code === code); }

test("missing and malformed brand identifiers are rejected", async () => {
  await expectCode(() => policy().validateBrand(null, ownerId), "FLEET_BRAND_REQUIRED");
  await expectCode(() => policy().validateBrand("", ownerId), "FLEET_BRAND_REQUIRED");
  await expectCode(() => policy().validateBrand("not-an-id", ownerId), "FLEET_BRAND_INVALID");
});

test("missing brands are rejected", async () => { await expectCode(() => policy().validateBrand(brandId, ownerId), "FLEET_BRAND_NOT_FOUND"); });

test("another operator's brand is forbidden", async () => {
  await expectCode(() => policy([{ _id: brandId, ownerId: "507f1f77bcf86cd799439099", status: "ACTIVE" }]).validateBrand(brandId, ownerId), "FLEET_BRAND_FORBIDDEN");
});

test("inactive brands are rejected", async () => {
  await expectCode(() => policy([{ _id: brandId, ownerId, status: "SUSPENDED" }]).validateBrand(brandId, ownerId), "FLEET_BRAND_INACTIVE");
});

test("an active brand owned by the operator is accepted", async () => {
  const brand = { _id: brandId, ownerId, brandName: "Himalayan Express", status: "ACTIVE" };
  assert.equal((await policy([brand]).validateBrand(brandId, ownerId)).brandName, "Himalayan Express");
});
