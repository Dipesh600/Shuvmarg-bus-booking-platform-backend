const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const { createStopSelectionResolver } = require("../../../src/modules/trip-discovery/stop-selection-resolver");
const { createTripDiscoveryController } = require("../../../src/modules/trip-discovery/trip-discovery.controller");

test("Canonical Stop Identity - Same Name Stops (Rampur Palpa -> Rampur Chitwan)", async (t) => {
  const rampurPalpaId = new mongoose.Types.ObjectId().toString();
  const rampurChitwanId = new mongoose.Types.ObjectId().toString();

  const mockRepository = {
    isValidObjectId: (id) => mongoose.Types.ObjectId.isValid(id),
    findStopById: async (id) => {
      if (id.toString() === rampurPalpaId) {
        return {
          _id: new mongoose.Types.ObjectId(rampurPalpaId),
          name: "Rampur",
          code: "RMP-PAL",
          district: "Palpa",
          province: "Lumbini",
          status: "ACTIVE",
          verificationStatus: "VERIFIED",
          isSearchable: true,
        };
      }
      if (id.toString() === rampurChitwanId) {
        return {
          _id: new mongoose.Types.ObjectId(rampurChitwanId),
          name: "Rampur",
          code: "RMP-CHI",
          district: "Chitwan",
          province: "Bagmati",
          status: "ACTIVE",
          verificationStatus: "VERIFIED",
          isSearchable: true,
        };
      }
      return null;
    },
    findChildStops: async () => [],
  };

  const stopSelectionResolver = createStopSelectionResolver({ repository: mockRepository });

  await t.test("allows search between two stops sharing the same display name ('Rampur')", async () => {
    const selection = await stopSelectionResolver.resolveStopSelection({
      fromStopId: rampurPalpaId,
      toStopId: rampurChitwanId,
      from: "Rampur",
      to: "Rampur",
    });

    assert.equal(selection.isIdentityMode, true);
    assert.equal(selection.fromScope.metadata.id, rampurPalpaId);
    assert.equal(selection.fromScope.metadata.district, "Palpa");
    assert.equal(selection.toScope.metadata.id, rampurChitwanId);
    assert.equal(selection.toScope.metadata.district, "Chitwan");
  });

  await t.test("controller returns structured search metadata in response", async () => {
    let capturedServiceArgs = null;
    const mockService = async (args) => {
      capturedServiceArgs = args;
      return {
        results: 1,
        total: 1,
        page: 1,
        totalPages: 1,
        search: {
          from: args.identitySelection.fromScope.metadata,
          to: args.identitySelection.toScope.metadata,
        },
        data: [{ _id: "trip-123", routeName: "Rampur Palpa to Rampur Chitwan Express" }],
        noRoutes: false,
      };
    };

    const controller = createTripDiscoveryController({
      searchTripsService: mockService,
      stopSelectionResolver,
      logger: { log: () => {}, error: () => {} },
    });

    const req = {
      body: {
        fromStopId: rampurPalpaId,
        toStopId: rampurChitwanId,
        from: "Rampur",
        to: "Rampur",
        date: "2026-08-01",
      },
      query: { page: "1", limit: "10" },
    };

    let responseData = null;
    let statusCode = null;

    const res = {
      status: (code) => {
        statusCode = code;
        return {
          json: (data) => {
            responseData = data;
          },
        };
      },
    };

    await controller.searchTrips(req, res);

    assert.equal(statusCode, 200);
    assert.equal(responseData.success, true);
    assert.equal(responseData.search.from.id, rampurPalpaId);
    assert.equal(responseData.search.from.district, "Palpa");
    assert.equal(responseData.search.to.id, rampurChitwanId);
    assert.equal(responseData.search.to.district, "Chitwan");
    assert.equal(responseData.data[0].routeName, "Rampur Palpa to Rampur Chitwan Express");
  });
});
