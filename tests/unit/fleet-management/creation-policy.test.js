"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { ApiError } = require("../../../src/contracts");
const {
  createFleetCreationPolicy,
  parseCreationInput,
} = require("../../../src/modules/fleet-management/fleet-creation.policy");

const valid = () => ({
  busName: " Night Rider ", busNumber: " ba 1 kha 22 ",
  busType: "AC", totalSeats: "40", vehicleType: "BUS",
});

test("fleet creation input preserves legacy parsing contracts", () => {
  assert.throws(
    () => parseCreationInput({}),
    (err) => err instanceof ApiError && err.code === "FLEET_VALIDATION_FAILED"
  );
  assert.throws(
    () => parseCreationInput({ ...valid(), seatConfig: "{" }),
    (err) => err instanceof ApiError && err.code === "FLEET_VALIDATION_FAILED"
  );
  const input = parseCreationInput({
    ...valid(), registrationYear: "2024", seatConfig: '{"deck":1}',
    amenityIds: '["wifi"]', requestViaStops: '["Pokhara"]',
  });
  assert.equal(input.busNumber, "BA 1 KHA 22");
  assert.equal(input.totalSeats, 40);
  assert.equal(input.registrationYear, 2024);
  assert.equal(input.vehicleType, "bus");
  assert.deepEqual(input.seatConfig, { deck: 1 });
  assert.deepEqual(input.amenityIds, ["wifi"]);
  assert.deepEqual(input.requestViaStops, ["Pokhara"]);
});

test("fleet creation rejects malformed or non-array catalog payloads instead of silently dropping data", () => {
  assert.throws(
    () => parseCreationInput({ ...valid(), registrationYear: "2024", amenityIds: "invalid" }),
    (err) => err instanceof ApiError && err.code === "FLEET_VALIDATION_FAILED"
  );
  assert.throws(
    () => parseCreationInput({ ...valid(), registrationYear: "2024", requestViaStops: '"Pokhara"' }),
    (err) => err instanceof ApiError && err.code === "FLEET_VALIDATION_FAILED"
  );
});

test("fleet creation requires a bounded registration year and normalizes vehicle type", () => {
  assert.throws(() => parseCreationInput(valid()), { code: "FLEET_VALIDATION_FAILED" });
  assert.throws(
    () => parseCreationInput({ ...valid(), registrationYear: "1979" }),
    { code: "FLEET_VALIDATION_FAILED" }
  );
  const input = parseCreationInput({ ...valid(), vehicleType: "MiNiBuS", registrationYear: "2025" });
  assert.equal(input.vehicleType, "minibus");
});

test("fleet creation validates references with exact legacy errors", async (t) => {
  const deps = {
    Bus: { findOne: async () => null },
    BusAmenities: { findById: async () => ({}), countDocuments: async () => 2 },
    BoardingPoints: { findById: async () => ({}) },
    OperatorBrand: {},
  };
  const policy = createFleetCreationPolicy(deps);
  await t.test("duplicate number", async () => {
    deps.Bus.findOne = async () => ({});
    await assert.rejects(
      policy.validateReferences({ busNumber: "B1", amenityIds: [] }),
      (err) => err instanceof ApiError && err.code === "FLEET_ALREADY_EXISTS"
    );
    deps.Bus.findOne = async () => null;
  });
  await t.test("legacy amenity", async () => {
    deps.BusAmenities.findById = async () => null;
    await assert.rejects(
      policy.validateReferences({ busNumber: "B1", amenitiesId: "a", amenityIds: [] }),
      (err) => err instanceof ApiError && err.code === "FLEET_VALIDATION_FAILED"
    );
    deps.BusAmenities.findById = async () => ({});
  });
  await t.test("amenity catalog", async () => {
    deps.BusAmenities.countDocuments = async () => 1;
    await assert.rejects(
      policy.validateReferences({ busNumber: "B1", amenityIds: ["a", "b"] }),
      (err) => err instanceof ApiError && err.code === "FLEET_VALIDATION_FAILED"
    );
    deps.BusAmenities.countDocuments = async () => 2;
  });
  await t.test("boarding point", async () => {
    deps.BoardingPoints.findById = async () => null;
    await assert.rejects(
      policy.validateReferences({ busNumber: "B1", amenityIds: [], boardingPointId: "p" }),
      (err) => err instanceof ApiError && err.code === "FLEET_VALIDATION_FAILED"
    );
  });
});

test("fleet creation rejects missing, invalid, and suspended brands", async () => {
  const brandQuery = (value) => ({
    select() { return this; }, lean: async () => value,
  });
  let brand = null;
  const policy = createFleetCreationPolicy({
    Bus: {}, BusAmenities: {}, BoardingPoints: {},
    OperatorBrand: { findById: () => brandQuery(brand) },
  });
  await assert.rejects(
    policy.validateBrand(null, "507f1f77bcf86cd799439011"),
    (err) => err instanceof ApiError && err.code === "FLEET_BRAND_REQUIRED"
  );
  await assert.rejects(
    policy.validateBrand("x", "507f1f77bcf86cd799439011"),
    (err) => err instanceof ApiError && err.code === "FLEET_BRAND_INVALID"
  );
  brand = { status: "SUSPENDED", brandName: "Shuv", ownerId: "507f1f77bcf86cd799439011" };
  await assert.rejects(
    policy.validateBrand("507f1f77bcf86cd799439022", "507f1f77bcf86cd799439011"),
    (err) => err instanceof ApiError && err.code === "FLEET_BRAND_INACTIVE"
  );
});
