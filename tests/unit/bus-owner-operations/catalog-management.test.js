"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createBoardingPointController,
} = require("../../../src/modules/bus-owner/boarding-point-management/boarding-point.controller");
const {
  createAmenityManagementController,
} = require("../../../src/modules/bus-owner/amenity-management/amenity-management.controller");

function response() {
  let status;
  let body;
  return {
    status(value) { status = value; return this; },
    json(value) { body = value; return this; },
    result: () => ({ status, body }),
  };
}

test("bus-owner boarding-point and amenity contracts", async (t) => {
  await t.test("boarding operations preserve exact service ownership", async () => {
    const calls = [];
    const service = {
      createBoardingPoints: async (...args) => (
        calls.push(["create", ...args]), "created"
      ),
      getBoardingPointsByUserId: async (...args) => (
        calls.push(["list", ...args]), ["point"]
      ),
      updateBoardingPoints: async (...args) => (
        calls.push(["update", ...args]), "updated"
      ),
      deleteBoardingPoint: async (...args) => calls.push(["delete", ...args]),
      getBoardingPointById: async (...args) => (
        calls.push(["get", ...args]), "point"
      ),
    };
    const handlers = createBoardingPointController({
      boardingPointService: service,
    });
    const req = {
      userInfo: { id: "owner" },
      body: { boardingPointId: "point", field: "value" },
    };
    for (const [name, status] of [
      ["createBoardingPoint", 201],
      ["getMyBoardingPoints", 200],
      ["updateBoardingPoint", 200],
      ["deleteBoardingPoint", 200],
      ["getBoardingPointsById", 200],
    ]) {
      const res = response();
      await handlers[name](req, res);
      assert.equal(res.result().status, status);
    }
    assert.deepEqual(calls, [
      ["create", "owner", req.body],
      ["list", "owner"],
      ["update", "point", "owner", req.body],
      ["delete", "point", "owner"],
      ["get", "point", "owner"],
    ]);
  });

  await t.test("amenity operations preserve exact service ownership", async () => {
    const calls = [];
    const service = {
      createAmenity: async (...args) => (calls.push(["create", ...args]), "new"),
      getAmenitiesByUserId: async (...args) => (
        calls.push(["list", ...args]), ["amenity"]
      ),
      updateAmenity: async (...args) => (
        calls.push(["update", ...args]), "updated"
      ),
      deleteAmenity: async (...args) => calls.push(["delete", ...args]),
      getAmenityById: async (...args) => (calls.push(["get", ...args]), "amenity"),
    };
    const handlers = createAmenityManagementController({
      amenityService: service,
    });
    const req = {
      userInfo: { id: "owner" },
      body: { amenityId: "amenity", field: "value" },
    };
    for (const [name, status] of [
      ["createAmenity", 201],
      ["getMyAmenities", 200],
      ["updateAmenity", 200],
      ["deleteAmenity", 200],
      ["getAmenityById", 200],
    ]) {
      const res = response();
      await handlers[name](req, res);
      assert.equal(res.result().status, status);
    }
    assert.deepEqual(calls, [
      ["create", "owner", req.body],
      ["list", "owner"],
      ["update", "amenity", "owner", req.body],
      ["delete", "amenity", "owner"],
      ["get", "amenity", "owner"],
    ]);
  });

  await t.test("missing IDs and authentication stop before service calls", async () => {
    let called = false;
    const boarding = createBoardingPointController({
      boardingPointService: {
        updateBoardingPoints: async () => { called = true; },
      },
    });
    const amenity = createAmenityManagementController({
      amenityService: {
        updateAmenity: async () => { called = true; },
      },
    });
    const boardingRes = response();
    await boarding.updateBoardingPoint(
      { userInfo: { id: "owner" }, body: {} }, boardingRes
    );
    assert.equal(boardingRes.result().body.message, "Boarding Point ID is required.");
    const amenityRes = response();
    await amenity.updateAmenity({ body: {} }, amenityRes);
    assert.equal(amenityRes.result().status, 401);
    assert.equal(called, false);
  });

  await t.test("not-found wording preserves read/update/delete mappings", async () => {
    const error = async () => { throw new Error("record not found"); };
    const handlers = createAmenityManagementController({
      amenityService: {
        getAmenityById: error, updateAmenity: error, deleteAmenity: error,
      },
      logger: { error() {} },
    });
    for (const name of ["getAmenityById", "updateAmenity", "deleteAmenity"]) {
      const res = response();
      await handlers[name]({
        userInfo: { id: "owner" }, body: { amenityId: "id" },
      }, res);
      assert.equal(res.result().status, 404);
    }
  });
});
