"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createOwnerBrandService } = require("../../../src/modules/bus-owner/brand/owner-brand.service");
const { createOwnerBrandController } = require("../../../src/modules/bus-owner/brand/owner-brand.controller");

test("owner-brand-service: listMyBrands returns only authenticated owner brands sorted default-first", async () => {
  const store = [
    {
      _id: "brand_1",
      ownerId: "owner_abc",
      brandName: "Alpha Travels",
      brandCode: "OB-AAA111",
      isDefault: false,
      status: "ACTIVE",
      notes: "Internal notes should not leak",
    },
    {
      _id: "brand_2",
      ownerId: "owner_abc",
      brandName: "Beta Travels",
      brandCode: "OB-BBB222",
      isDefault: true,
      status: "ACTIVE",
    },
    {
      _id: "brand_other",
      ownerId: "owner_xyz",
      brandName: "Foreign Travels",
      brandCode: "OB-ZZZ999",
      isDefault: true,
      status: "ACTIVE",
    },
  ];

  const MockOperatorBrand = {
    find(filter) {
      return {
        select() {
          return {
            sort() {
              return {
                async lean() {
                  return store
                    .filter((b) => b.ownerId === filter.ownerId)
                    .sort((a, b) => (b.isDefault ? 1 : 0) - (a.isDefault ? 1 : 0) || a.brandName.localeCompare(b.brandName));
                },
              };
            },
          };
        },
      };
    },
  };

  const service = createOwnerBrandService({ OperatorBrand: MockOperatorBrand });
  const result = await service.listMyBrands("owner_abc");

  assert.equal(result.length, 2);
  assert.equal(result[0].id, "brand_2");
  assert.equal(result[0].isDefault, true);
  assert.equal(result[1].id, "brand_1");
  assert.equal(result[1].isDefault, false);
  assert.equal(result[0].notes, undefined);
});

test("owner-brand-controller: requires authentication and returns data array", async () => {
  const service = {
    listMyBrands: async (ownerId) => [{ id: "b1", brandName: "B1", isDefault: true, status: "ACTIVE" }],
  };
  const controller = createOwnerBrandController({ service });

  let statusCode = 0;
  let responseData = null;
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(data) {
      responseData = data;
      return this;
    },
  };

  // Unauthorized call
  await controller.listBrands({}, res);
  assert.equal(statusCode, 401);
  assert.equal(responseData.success, false);

  // Authorized call
  await controller.listBrands({ userInfo: { id: "owner_123" } }, res);
  assert.equal(statusCode, 200);
  assert.equal(responseData.success, true);
  assert.deepEqual(responseData.data, [{ id: "b1", brandName: "B1", isDefault: true, status: "ACTIVE" }]);
});
