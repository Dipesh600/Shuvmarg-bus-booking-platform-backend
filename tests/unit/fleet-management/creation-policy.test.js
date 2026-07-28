"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createFleetCreationPolicy,
  parseCreationInput,
} = require("../../../src/modules/fleet-management/fleet-creation.policy");

const valid = () => ({
  busName: " Night Rider ", busNumber: " ba 1 kha 22 ",
  busType: "AC", totalSeats: "40", vehicleType: "BUS",
});

test("fleet creation input preserves legacy parsing contracts", () => {
  assert.throws(() => parseCreationInput({}), /Missing required fleet fields\./);
  assert.throws(
    () => parseCreationInput({ ...valid(), seatConfig: "{" }),
    /Invalid seatConfig JSON\./
  );
  const input = parseCreationInput({
    ...valid(), registrationYear: "2024", seatConfig: '{"deck":1}',
    amenityIds: "invalid", requestViaStops: '["Pokhara"]',
  });
  assert.equal(input.busNumber, "BA 1 KHA 22");
  assert.equal(input.totalSeats, 40);
  assert.equal(input.registrationYear, 2024);
  assert.deepEqual(input.seatConfig, { deck: 1 });
  assert.deepEqual(input.amenityIds, []);
  assert.deepEqual(input.requestViaStops, ["Pokhara"]);
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
      /Bus number already exists!/
    );
    deps.Bus.findOne = async () => null;
  });
  await t.test("legacy amenity", async () => {
    deps.BusAmenities.findById = async () => null;
    await assert.rejects(
      policy.validateReferences({ busNumber: "B1", amenitiesId: "a", amenityIds: [] }),
      /Invalid amenitiesId provided\./
    );
    deps.BusAmenities.findById = async () => ({});
  });
  await t.test("amenity catalog", async () => {
    deps.BusAmenities.countDocuments = async () => 1;
    await assert.rejects(
      policy.validateReferences({ busNumber: "B1", amenityIds: ["a", "b"] }),
      /One or more amenityIds are invalid\./
    );
    deps.BusAmenities.countDocuments = async () => 2;
  });
  await t.test("boarding point", async () => {
    deps.BoardingPoints.findById = async () => null;
    await assert.rejects(
      policy.validateReferences({ busNumber: "B1", amenityIds: [], boardingPointId: "p" }),
      /Invalid boardingPointId provided\./
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
  await assert.rejects(policy.validateBrand("x"), /Brand not found/);
  brand = { status: "SUSPENDED", brandName: "Shuv" };
  await assert.rejects(
    policy.validateBrand("x"),
    /Brand "Shuv" is currently suspended/
  );
  await policy.validateBrand(null);
});
