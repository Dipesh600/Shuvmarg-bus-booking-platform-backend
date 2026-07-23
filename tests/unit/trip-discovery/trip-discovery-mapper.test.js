const { test } = require("node:test");
const assert = require("node:assert");
const { createTripMapper } = require("../../../src/modules/trip-discovery/trip-discovery-mapper");

test("Trip Discovery Mapper", async (t) => {
  const dummyTrip = {
    _id: "trip123",
    tripDate: new Date("2024-01-01"),
    departureTime: { time: "05:00 PM" },
    busId: {
      _id: "bus1",
      busName: "Super Bus",
      amenitiesId: { amenities: ["wifi", "ac"] },
      fleetImages: ["image1.jpg"]
    },
    routeId: {
      _id: "route1",
      routeName: "CityA to CityB",
      basePrice: 1000
    },
    variantId: {
      _id: "var1",
      name: "Main Variant"
    }
  };

  const getPresignedUrlMock = async (key) => `http://s3/${key}`;
  const timeToMinsMock = (timeStr) => 0; // dummy
  const seatMap = { "trip123": 15 };
  const originStopIds = new Set();
  const destStopIds = new Set();

  const { mapTripResponse } = createTripMapper({ getPresignedUrl: getPresignedUrlMock, timeToMins: timeToMinsMock });

  await t.test("formats standard output matching legacy API exactly", async () => {
    const result = await mapTripResponse([dummyTrip], seatMap, originStopIds, destStopIds, null, null);
    assert.strictEqual(result.length, 1);
    const mapped = result[0];

    assert.strictEqual(mapped._id, "trip123");
    assert.strictEqual(mapped.routeDetail.routeName, "CityA to CityB");
    assert.strictEqual(mapped.busDetail.busName, "Super Bus");
    assert.strictEqual(mapped.availableSeats, 15);
  });

  await t.test("returns presigned AWS S3 URLs correctly", async () => {
    const result = await mapTripResponse([dummyTrip], seatMap, originStopIds, destStopIds, null, null);
    assert.deepStrictEqual(result[0].busDetail.fleetImages, ["http://s3/image1.jpg"]);
  });

  await t.test("handles missing arrays securely", async () => {
    const tripNoImages = { ...dummyTrip, busId: { ...dummyTrip.busId, fleetImages: null, amenitiesId: null } };
    const result = await mapTripResponse([tripNoImages], seatMap, originStopIds, destStopIds, null, null);
    assert.deepStrictEqual(result[0].busDetail.fleetImages, []);
    assert.deepStrictEqual(result[0].busDetail.amenities, []);
  });

  await t.test("omits dropped paths (createdAt, etc)", async () => {
    const tripWithExtra = { ...dummyTrip, createdAt: "2024", updatedAt: "2024", __v: 1 };
    const result = await mapTripResponse([tripWithExtra], seatMap, originStopIds, destStopIds, null, null);
    const mapped = result[0];
    assert.strictEqual(mapped.createdAt, undefined);
    assert.strictEqual(mapped.updatedAt, undefined);
    assert.strictEqual(mapped.__v, undefined);
  });
});
