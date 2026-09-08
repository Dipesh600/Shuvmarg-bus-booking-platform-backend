const { test, mock } = require("node:test");
const assert = require("node:assert");
const { createPassengerBookingCancellationRepository } = require("../../../src/modules/booking/passenger-booking-cancellation/passenger-booking-cancellation.repository.js");

const repository = createPassengerBookingCancellationRepository();
const Booking = require("../../../models/bookTicketModel.js");
const Trip = require("../../../models/tripModel");
const Seat = require("../../../models/seatsModel.js");
const Refund = require("../../../models/refundModel");
const UserDeviceInfo = require("../../../models/userDeviceInfoModel.js");

test("repository - findBookingByTicketId", async () => {
  mock.method(Booking, "findOne", async () => ({ id: 1 }));
  const res = await repository.findBookingByTicketId("T1");
  assert.strictEqual(res.id, 1);
});

test("repository - findTripById", async () => {
  mock.method(Trip, "findById", async () => ({ id: 2 }));
  const res = await repository.findTripById("t1");
  assert.strictEqual(res.id, 2);
});

test("repository - findSeatByTripId", async () => {
  mock.method(Seat, "findOne", async () => ({ id: 3 }));
  const res = await repository.findSeatByTripId("t1");
  assert.strictEqual(res.id, 3);
});

test("repository - saveSeat", async () => {
  const doc = { markModified: mock.fn(), save: async () => ({ saved: true }) };
  const res = await repository.saveSeat(doc);
  assert.strictEqual(doc.markModified.mock.calls.length, 3);
  assert.strictEqual(res.saved, true);
});

test("repository - createRefund requires the cancellation transaction", async () => {
  await assert.rejects(() => repository.createRefund({}), /active transaction/);
});

test("repository - saveBooking", async () => {
  const doc = { save: async () => ({ saved: true }) };
  const res = await repository.saveBooking(doc);
  assert.strictEqual(res.saved, true);
});

test("repository - findTripByIdWithRoute", async () => {
  mock.method(Trip, "findById", () => ({
    populate: async () => ({ id: 5 })
  }));
  const res = await repository.findTripByIdWithRoute("t1");
  assert.strictEqual(res.id, 5);
});

test("repository - findUserDevices", async () => {
  mock.method(UserDeviceInfo, "find", async () => [{ token: "a" }]);
  const res = await repository.findUserDevices("u1");
  assert.strictEqual(res.length, 1);
});
