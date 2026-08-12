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

const seatConfig = () => ({
  busShape: "SINGLE_DECKER",
  floors: [{ floorIndex: 0, rows: [{ rowIndex: 0, cells: [{
    colIndex: 0, cellType: "SEAT", seatId: "S1",
    seatLabel: "1", seatType: "STANDARD",
  }] }] }],
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
    ...valid(), totalSeats: "1", registrationYear: "2024",
    seatConfig: JSON.stringify(seatConfig()),
    amenityIds: "invalid", requestViaStops: '["Pokhara"]',
  });
  assert.equal(input.busNumber, "BA 1 KHA 22");
  assert.equal(input.totalSeats, 1);
  assert.equal(input.registrationYear, 2024);
  assert.equal(input.seatConfig.busShape, "SINGLE_DECKER");
  assert.deepEqual(input.amenityIds, []);
  assert.deepEqual(input.requestViaStops, ["Pokhara"]);
});

test("fleet creation rejects invalid geometry and capacity mismatch", () => {
  assert.throws(
    () => parseCreationInput({ ...valid(), seatConfig: '{"deck":1}' }),
    (error) => error instanceof ApiError && error.code === "FLEET_LAYOUT_INVALID"
  );
  assert.throws(
    () => parseCreationInput({ ...valid(), seatConfig: seatConfig() }),
    (error) => error instanceof ApiError && error.code === "FLEET_LAYOUT_INVALID"
  );
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

test("fleet creation rejects missing and suspended brands", async () => {
  const brandQuery = (value) => ({
    select() { return this; }, lean: async () => value,
  });
  let brand = null;
  const policy = createFleetCreationPolicy({
    Bus: {}, BusAmenities: {}, BoardingPoints: {},
    OperatorBrand: { findById: () => brandQuery(brand) },
  });
  await assert.rejects(
    policy.validateBrand("x"),
    (err) => err instanceof ApiError && err.code === "FLEET_VALIDATION_FAILED"
  );
  brand = { status: "SUSPENDED", brandName: "Shuv" };
  await assert.rejects(
    policy.validateBrand("x"),
    (err) => err instanceof ApiError && err.code === "FLEET_VALIDATION_FAILED"
  );
  await policy.validateBrand(null);
});
