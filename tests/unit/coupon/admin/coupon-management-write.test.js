"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createCouponCreationService,
} = require("../../../../src/modules/coupon/admin/management/coupon-create.service");
const {
  createCouponStateService,
} = require("../../../../src/modules/coupon/admin/management/coupon-state.service");
const policy = require(
  "../../../../src/modules/coupon/admin/management/coupon-write.policy"
);
const mapper = require(
  "../../../../src/modules/coupon/admin/management/coupon-write.mapper"
);

const valid = {
  couponCode: "save10",
  title: "Save",
  discountType: "percentage",
  discountValue: 10,
  validFrom: "2026-01-01",
  validTo: "2026-02-01",
};

test("creation preserves normalized persistence defaults and admin ownership", async () => {
  let saved;
  const service = createCouponCreationService({
    repository: {
      findByCode: async () => null,
      create: async (data) => {
        saved = { _id: "c1", ...data };
        return saved;
      },
    },
    policy,
    mapper,
    offerNotification: async () => {},
  });
  const result = await service.create(valid, { id: "admin-1" });
  assert.equal(result.statusCode, 201);
  assert.equal(saved.couponCode, "SAVE10");
  assert.equal(saved.minOrderAmount, 0);
  assert.equal(saved.maxDiscountAmount, null);
  assert.equal(saved.perUserLimit, 1);
  assert.deepEqual(saved.applicableRoutes, []);
  assert.equal(saved.createdBy, "admin-1");
  assert.equal(saved.lastModifiedBy, "admin-1");
});

test("creation preserves the legacy post-save notification return defect", async () => {
  let persisted = false;
  const service = createCouponCreationService({
    repository: {
      findByCode: async () => null,
      create: async (data) => {
        persisted = true;
        return data;
      },
    },
    policy,
    mapper,
    offerNotification: () => undefined,
  });
  await assert.rejects(
    service.create(valid, { id: "admin-1" }),
    /Cannot read properties of undefined \(reading 'catch'\)/
  );
  assert.equal(persisted, true);
});

test("used coupon deletion and missing coupon preserve exact responses", async () => {
  const used = createCouponStateService({
    repository: { countUsage: async () => 1 },
    offerNotification: async () => {},
  });
  assert.deepEqual(await used.remove("c1"), {
    statusCode: 400,
    body: {
      success: false,
      message:
        "Cannot delete coupon that has been used. You can deactivate it instead.",
    },
  });
  const missing = createCouponStateService({
    repository: {
      countUsage: async () => 0,
      deleteById: async () => null,
    },
    offerNotification: async () => {},
  });
  assert.equal((await missing.remove("c1")).statusCode, 404);
});

test("activation saves before preserving notification return defect", async () => {
  let saved = false;
  const coupon = {
    isActive: false,
    save: async () => {
      saved = true;
    },
  };
  const service = createCouponStateService({
    repository: { findById: async () => coupon },
    offerNotification: () => undefined,
  });
  await assert.rejects(
    service.toggle("c1", { id: "admin-1" }),
    /Cannot read properties of undefined \(reading 'catch'\)/
  );
  assert.equal(coupon.isActive, true);
  assert.equal(saved, true);
});
