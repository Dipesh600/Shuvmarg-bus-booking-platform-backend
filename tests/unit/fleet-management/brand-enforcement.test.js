"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createFleetCreationPolicy } = require("../../../src/modules/fleet-management/fleet-creation.policy");
const { ApiError } = require("../../../src/contracts");

function createMockBrandModel(brands = []) {
  return {
    findById(id) {
      const brand = brands.find((b) => String(b._id) === String(id));
      return {
        select() {
          return {
            async lean() {
              return brand || null;
            },
          };
        },
      };
    },
  };
}

test("brand-enforcement: missing brand is rejected with FLEET_BRAND_REQUIRED", async () => {
  const policy = createFleetCreationPolicy({
    Bus: {},
    BusAmenities: {},
    BoardingPoints: {},
    OperatorBrand: createMockBrandModel([]),
  });

  await assert.rejects(
    async () => policy.validateBrand(null, "507f1f77bcf86cd799439011"),
    (err) => {
      assert(err instanceof ApiError);
      assert.equal(err.code, "FLEET_BRAND_REQUIRED");
      return true;
    }
  );

  await assert.rejects(
    async () => policy.validateBrand("", "507f1f77bcf86cd799439011"),
    (err) => {
      assert(err instanceof ApiError);
      assert.equal(err.code, "FLEET_BRAND_REQUIRED");
      return true;
    }
  );
});

test("brand-enforcement: malformed brand ID is rejected with FLEET_BRAND_INVALID", async () => {
  const policy = createFleetCreationPolicy({
    Bus: {},
    BusAmenities: {},
    BoardingPoints: {},
    OperatorBrand: createMockBrandModel([]),
  });

  await assert.rejects(
    async () => policy.validateBrand("not-a-valid-objectid", "507f1f77bcf86cd799439011"),
    (err) => {
      assert(err instanceof ApiError);
      assert.equal(err.code, "FLEET_BRAND_INVALID");
      return true;
    }
  );
});

test("brand-enforcement: non-existent brand is rejected with FLEET_BRAND_NOT_FOUND", async () => {
  const policy = createFleetCreationPolicy({
    Bus: {},
    BusAmenities: {},
    BoardingPoints: {},
    OperatorBrand: createMockBrandModel([]),
  });

  await assert.rejects(
    async () => policy.validateBrand("507f1f77bcf86cd799439099", "507f1f77bcf86cd799439011"),
    (err) => {
      assert(err instanceof ApiError);
      assert.equal(err.code, "FLEET_BRAND_NOT_FOUND");
      return true;
    }
  );
});

test("brand-enforcement: brand belonging to another owner is rejected with FLEET_BRAND_FORBIDDEN", async () => {
  const brandId = "507f1f77bcf86cd799439022";
  const brandOwner = "507f1f77bcf86cd799439011";
  const requestOwner = "507f1f77bcf86cd799439099";

  const policy = createFleetCreationPolicy({
    Bus: {},
    BusAmenities: {},
    BoardingPoints: {},
    OperatorBrand: createMockBrandModel([
      {
        _id: brandId,
        ownerId: brandOwner,
        brandName: "Himalayan Express",
        status: "ACTIVE",
      },
    ]),
  });

  await assert.rejects(
    async () => policy.validateBrand(brandId, requestOwner),
    (err) => {
      assert(err instanceof ApiError);
      assert.equal(err.code, "FLEET_BRAND_FORBIDDEN");
      assert.equal(err.statusCode, 403);
      return true;
    }
  );
});

test("brand-enforcement: inactive/suspended brand is rejected with FLEET_BRAND_INACTIVE", async () => {
  const brandId = "507f1f77bcf86cd799439022";
  const ownerId = "507f1f77bcf86cd799439011";

  const policy = createFleetCreationPolicy({
    Bus: {},
    BusAmenities: {},
    BoardingPoints: {},
    OperatorBrand: createMockBrandModel([
      {
        _id: brandId,
        ownerId,
        brandName: "Suspended Express",
        status: "SUSPENDED",
      },
    ]),
  });

  await assert.rejects(
    async () => policy.validateBrand(brandId, ownerId),
    (err) => {
      assert(err instanceof ApiError);
      assert.equal(err.code, "FLEET_BRAND_INACTIVE");
      assert.equal(err.statusCode, 409);
      return true;
    }
  );
});

test("brand-enforcement: valid active owned brand is accepted", async () => {
  const brandId = "507f1f77bcf86cd799439022";
  const ownerId = "507f1f77bcf86cd799439011";

  const policy = createFleetCreationPolicy({
    Bus: {},
    BusAmenities: {},
    BoardingPoints: {},
    OperatorBrand: createMockBrandModel([
      {
        _id: brandId,
        ownerId,
        brandName: "Himalayan Express",
        status: "ACTIVE",
      },
    ]),
  });

  const validated = await policy.validateBrand(brandId, ownerId);
  assert.equal(validated.brandName, "Himalayan Express");
  assert.equal(validated.status, "ACTIVE");
});
