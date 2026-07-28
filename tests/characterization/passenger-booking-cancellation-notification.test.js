const test = require("node:test");
const assert = require("node:assert");
const { setupHarness } = require("../helpers/passenger-booking-cancellation-harness");
const mongoose = require("mongoose");

test("passenger-booking-cancellation notification characterization", async (t) => {
  const harness = setupHarness();
  const req = { body: {}, userInfo: {} };
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
  };

  t.after(() => harness.restore());

  await t.test("notification sends correct push message and local notification when tokens exist", async () => {
    req.body = { ticketId: "T123" };
    const userId = new mongoose.Types.ObjectId();
    req.userInfo = { id: userId.toString() };
    
    const booking = {
      _id: new mongoose.Types.ObjectId(),
      ticketId: "T123",
      userId,
      status: "booked",
      tripId: new mongoose.Types.ObjectId(),
      totalAmount: 1000,
      seats: ["A1"],
      save: async () => {}
    };
    const mockQuery = {
      populate: () => Promise.resolve({ routeId: { from: "KTM", to: "PKR" } }),
      then: function(resolve) {
        resolve({
          tripDate: "2026-07-25",
          departureTime: "10:00",
          populate: this.populate
        });
      },
      tripDate: "2026-07-25",
      departureTime: "10:00"
    };
    harness.mocks.tripFindById.mock.mockImplementation(() => mockQuery);

    
    harness.mocks.bookingFindOne.mock.mockImplementationOnce(() => Promise.resolve(booking));
    harness.mocks.calculateRefund.mock.mockImplementationOnce(() => Promise.resolve({ eligible: true, refundAmount: 800 }));
    harness.mocks.seatFindOne.mock.mockImplementationOnce(() => Promise.resolve({ seata: [], seatb: [], seatc: [], markModified: () => {}, save: async () => {} }));
    harness.mocks.refundCreate.mock.mockImplementationOnce(() => Promise.resolve({ _id: "refund123" }));
    harness.mocks.userDeviceInfoFind.mock.mockImplementationOnce(() => Promise.resolve([{ token: "tok1" }, { token: "" }, { token: "tok2" }]));
    
    let localNotifyArgs, pushNotifyArgs;
    harness.mocks.createLocalNotification.mock.mockImplementationOnce((...args) => {
      localNotifyArgs = args;
      return Promise.resolve();
    });
    harness.mocks.notificationManager.mock.mockImplementationOnce((...args) => {
      pushNotifyArgs = args;
      return Promise.resolve();
    });

    await harness.passengerBookingCancellation.cancelPassengerBooking(req, res);
    
    assert.strictEqual(res.statusCode, 200);

    assert.strictEqual(localNotifyArgs[0], userId.toString());
    assert.strictEqual(localNotifyArgs[1], "TICKET_CANCELLED");
    assert.strictEqual(localNotifyArgs[2], "Booking Cancelled");
    assert.strictEqual(localNotifyArgs[3], "Your booking (T123) for KTM to PKR has been cancelled. Refund of NPR 800 is being processed.");
    assert.deepStrictEqual(localNotifyArgs[4], {
      tripId: booking.tripId,
      seats: ["A1"],
      ticketId: "T123",
      route: "KTM to PKR",
      refundAmount: 800
    });

    assert.deepStrictEqual(pushNotifyArgs[0], ["tok1", "tok2"]);
    assert.strictEqual(pushNotifyArgs[1], "Booking Cancelled");
    assert.strictEqual(pushNotifyArgs[2], "Your booking (T123) for KTM to PKR has been cancelled. Refund: NPR 800.");
  });
  
  await t.test("notification failure does not block cancellation response", async () => {
    req.body = { ticketId: "T123" };
    const userId = new mongoose.Types.ObjectId();
    req.userInfo = { id: userId.toString() };
    
    const booking = {
      _id: new mongoose.Types.ObjectId(),
      ticketId: "T123",
      userId,
      status: "booked",
      tripId: new mongoose.Types.ObjectId(),
      totalAmount: 1000,
      seats: ["A1"],
      save: async () => {}
    };
    
    const mockQuery2 = {
      populate: () => Promise.resolve(null),
      then: function(resolve) {
        resolve({
          tripDate: "2026-07-25",
          departureTime: "10:00",
          populate: this.populate
        });
      },
      tripDate: "2026-07-25",
      departureTime: "10:00"
    };
    harness.mocks.tripFindById.mock.mockImplementation(() => mockQuery2);
    harness.mocks.bookingFindOne.mock.mockImplementationOnce(() => Promise.resolve(booking));
    harness.mocks.calculateRefund.mock.mockImplementationOnce(() => Promise.resolve({ eligible: true, refundAmount: 800 }));
    harness.mocks.seatFindOne.mock.mockImplementationOnce(() => Promise.resolve({ seata: [], seatb: [], seatc: [], markModified: () => {}, save: async () => {} }));
    harness.mocks.refundCreate.mock.mockImplementationOnce(() => Promise.resolve({ _id: "refund123" }));
    
    harness.mocks.createLocalNotification.mock.mockImplementationOnce(() => Promise.reject(new Error("Notify Error")));

    await harness.passengerBookingCancellation.cancelPassengerBooking(req, res);
    
    // Notification failure still results in 200
    assert.strictEqual(res.statusCode, 200);
  });
});
