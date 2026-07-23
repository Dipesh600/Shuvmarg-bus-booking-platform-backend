const { test } = require("node:test");
const assert = require("node:assert");
const { createTripDiscoveryController } = require("../../../src/modules/trip-discovery/trip-discovery.controller");
const AppError = require("../../../src/shared/errors/app-error");

test("Trip Discovery Controller", async (t) => {

  await t.test("calls service.findTrips with correctly extracted inputs", async () => {
    const req = {
      body: { from: "cityA", to: "cityB", date: "2024-01-01", shift: "day" },
      query: { page: "2", limit: "15" }
    };
    const res = {
      status: (code) => {
        assert.strictEqual(code, 200);
        return {
          json: (data) => {
            assert.strictEqual(data.success, true);
            assert.strictEqual(data.results, 1);
            assert.deepStrictEqual(data.data, [{ id: "trip1" }]);
            assert.strictEqual(data.page, 2);
          }
        };
      }
    };
    const mockService = async (opts) => {
      assert.strictEqual(opts.from, "cityA");
      assert.strictEqual(opts.to, "cityB");
      assert.strictEqual(opts.date, "2024-01-01");
      assert.strictEqual(opts.shift, "day");
      assert.strictEqual(opts.page, 2);
      assert.strictEqual(opts.limit, 15);
      return {
        data: [{ id: "trip1" }],
        total: 1,
        totalPages: 1,
        page: 2,
        results: 1
      };
    };
    const mockLogger = { log: () => {}, error: () => {} };
    const { searchTrips } = createTripDiscoveryController({ searchTripsService: mockService, logger: mockLogger });
    await searchTrips(req, res, () => {});
  });

  await t.test("handles service errors and next() propagation", async () => {
    const req = { body: { from: "cityA", to: "cityB", date: "2024-01-01" }, query: {} };
    const res = {
      status: (code) => {
        assert.strictEqual(code, 500);
        return {
          json: (data) => {
            assert.strictEqual(data.success, false);
          }
        };
      }
    };
    const mockService = async () => {
      throw new Error("Service error");
    };
    const mockLogger = { log: () => {}, error: () => {} };
    const { searchTrips } = createTripDiscoveryController({ searchTripsService: mockService, logger: mockLogger });
    await searchTrips(req, res, () => {});
  });
});
