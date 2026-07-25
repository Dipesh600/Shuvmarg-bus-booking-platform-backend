const test = require("node:test");
const assert = require("node:assert");
const { setupHarness } = require("../helpers/passenger-booking-cancellation-harness");
const mongoose = require("mongoose");

test("passenger-booking-cancellation seat release characterization", async (t) => {
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

  await t.test("seat lookup uses tripId, processes all booking seats case-insensitively across seata, seatb, seatc", async () => {
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
      seats: ["A1", "B2", "c3", "MISSING", "a1"],
      save: async () => {}
    };
    
    const trip = { tripDate: "2026-07-25", departureTime: "10:00" };
    
    let markModifiedCalls = [];
    const seatDoc = {
      seata: [{ seatNo: "a1", booked: true, bookedBy: "user", bookedAt: new Date() }],
      seatb: [{ seatNo: "b2", booked: true, bookedBy: "user", bookedAt: new Date() }],
      seatc: [{ seatNo: "C3", booked: true, bookedBy: "user", bookedAt: new Date() }],
      markModified: (field) => { markModifiedCalls.push(field); },
      save: async () => {}
    };

    harness.mocks.bookingFindOne.mock.mockImplementationOnce(() => Promise.resolve(booking));
    harness.mocks.tripFindById.mock.mockImplementation(() => ({ populate: () => Promise.resolve(trip) }));
    harness.mocks.calculateRefund.mock.mockImplementationOnce(() => Promise.resolve({ eligible: true, refundAmount: 800 }));
    harness.mocks.seatFindOne.mock.mockImplementationOnce((query) => {
      assert.deepStrictEqual(query, { tripId: booking.tripId });
      return Promise.resolve(seatDoc);
    });

    await harness.ticketController.cancelTicket(req, res);
    
    assert.strictEqual(res.statusCode, 200);

    // Assert seats were mutated to false
    assert.strictEqual(seatDoc.seata[0].booked, false);
    assert.strictEqual(seatDoc.seatb[0].booked, false);
    assert.strictEqual(seatDoc.seatc[0].booked, false);
    
    // Assert all markModified are called
    assert.deepStrictEqual(markModifiedCalls, ['seata', 'seatb', 'seatc']);
  });
});
