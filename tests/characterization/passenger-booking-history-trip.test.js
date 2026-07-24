const { describe, it, beforeEach, afterEach, mock } = require("node:test");
const assert = require("node:assert");
const { setupHarness } = require("../helpers/passenger-booking-history-harness");
const { Types } = require("mongoose");

describe("passenger-booking-history trip/image characterization", () => {
  let harness;
  let req;
  let res;

  beforeEach(() => {
    harness = setupHarness();
    req = { userInfo: { id: new Types.ObjectId().toString() } };
    res = {
      status: mock.fn(() => res),
      json: mock.fn(),
    };
  });

  afterEach(() => {
    harness.restore();
  });

  it("handles missing bus cleanly, does not call image service", async () => {
    const bookingDoc = { _id: new Types.ObjectId(), tripId: { busId: null } };
    
    harness.mocks.bookingFind.mock.mockImplementation(() => ({
      populate: () => ({ lean: () => Promise.resolve([bookingDoc]) })
    }));

    await harness.ticketController.getMyTicketHistory(req, res);

    const jsonArg = res.json.mock.calls[0].arguments[0];
    const item = jsonArg.data[0];
    assert.strictEqual(item.trip.busId, null);
    assert.strictEqual(harness.mocks.getPresignedUrl.mock.callCount(), 0);
  });

  it("handles bus fleetImages correctly, maintaining order and filtering falsy", async () => {
    const bookingDoc = {
      _id: new Types.ObjectId(),
      tripId: {
        busId: {
          busName: "Super Bus",
          fleetImages: ["img1", "img2", "img3", "img4"],
          amenitiesId: "amenityData",
          boardingPointId: "boardingData",
        },
      }
    };
    
    harness.mocks.bookingFind.mock.mockImplementation(() => ({
      populate: () => ({ lean: () => Promise.resolve([bookingDoc]) })
    }));

    harness.mocks.getPresignedUrl.mock.mockImplementation(async (key) => {
      if (key === "img2") return null;
      if (key === "img3") return "";
      return `https://s3.url/${key}`;
    });

    await harness.ticketController.getMyTicketHistory(req, res);

    const jsonArg = res.json.mock.calls[0].arguments[0];
    const item = jsonArg.data[0];
    const trip = item.trip;
    
    assert.strictEqual(harness.mocks.getPresignedUrl.mock.callCount(), 4);
    assert.deepStrictEqual(trip.busId.fleetImages, ["https://s3.url/img1", "https://s3.url/img4"]);
    
    // Check property removal
    assert.ok(trip.busId.hasOwnProperty('amenitiesId'));
    assert.strictEqual(trip.busId.amenitiesId, undefined);
    assert.ok(trip.busId.hasOwnProperty('boardingPointId'));
    assert.strictEqual(trip.busId.boardingPointId, undefined);
    
    assert.strictEqual(trip.busId.amenitiesDetail, "amenityData");
    assert.strictEqual(trip.busId.boardingPointDetail, "boardingData");
  });

  it("handles missing fleetImages gracefully", async () => {
    const bookingDoc = {
      _id: new Types.ObjectId(),
      tripId: {
        busId: {
          busName: "Super Bus",
          fleetImages: null,
        },
      }
    };
    
    harness.mocks.bookingFind.mock.mockImplementation(() => ({
      populate: () => ({ lean: () => Promise.resolve([bookingDoc]) })
    }));

    await harness.ticketController.getMyTicketHistory(req, res);

    const jsonArg = res.json.mock.calls[0].arguments[0];
    const trip = jsonArg.data[0].trip;
    assert.deepStrictEqual(trip.busId.fleetImages, []);
    assert.strictEqual(harness.mocks.getPresignedUrl.mock.callCount(), 0);
  });


});
