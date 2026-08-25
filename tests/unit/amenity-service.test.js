"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const BusAmenities = require("../../models/busAmenitiesModel");
const Bus = require("../../models/fleetModel");
const service = require("../../services/amenityService");

const ownerId = new mongoose.Types.ObjectId().toString();
const amenityId = new mongoose.Types.ObjectId().toString();

test("amenity service normalizes canonical input", () => {
  assert.deepEqual(service.normalizeInput({
    name: "  Reading   Light ", description: "  At every seat  ", icon: " ZAP ",
  }), { name: "Reading Light", description: "At every seat", icon: "zap" });
  assert.throws(
    () => service.normalizeInput({ name: "x" }),
    (error) => error.code === "AMENITY_VALIDATION_FAILED" && error.statusCode === 400,
  );
});

test("owner creation cannot override custom scope", async (t) => {
  let written;
  t.mock.method(BusAmenities, "create", async (value) => { written = value; return value; });
  await service.createAmenity({ name: "WiFi", type: "GLOBAL", status: false }, ownerId);
  assert.equal(written.type, "CUSTOM");
  assert.equal(written.ownerId, ownerId);
  assert.equal(written.status, true);
});

test("operators cannot read another owner's custom amenity", async (t) => {
  const anotherOwner = new mongoose.Types.ObjectId().toString();
  t.mock.method(BusAmenities, "findById", () => ({
    lean: async () => ({ _id: amenityId, type: "CUSTOM", ownerId: anotherOwner }),
  }));
  await assert.rejects(
    service.getAmenityById(amenityId, ownerId),
    (error) => error.code === "AMENITY_NOT_FOUND" && error.statusCode === 404,
  );
});

test("referenced amenities are retained and must be deactivated", async (t) => {
  t.mock.method(BusAmenities, "findById", () => ({
    lean: async () => ({ _id: amenityId, type: "GLOBAL", ownerId: null }),
  }));
  t.mock.method(Bus, "countDocuments", async () => 2);
  await assert.rejects(
    service.deleteAmenity(amenityId),
    (error) => error.code === "AMENITY_IN_USE" && error.statusCode === 409,
  );
});
