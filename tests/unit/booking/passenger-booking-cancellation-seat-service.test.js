const { test } = require("node:test");
const assert = require("node:assert");
const { createPassengerBookingCancellationSeatService } = require("../../../src/modules/booking/passenger-booking-cancellation/passenger-booking-cancellation-seat.service.js");
const { freeSeats } = createPassengerBookingCancellationSeatService();
test("freeSeats - correctly frees a seat", () => {
  const seatDoc = {
    seata: [{ seatNo: "A1", booked: true, bookedBy: "u1", bookedAt: new Date() }],
    seatb: [{ seatNo: "b2", booked: true, bookedBy: "u1" }],
    seatc: [{ seatNo: "c3", booked: false }]
  };

  freeSeats(seatDoc, ["A1", "B2"]);

  assert.strictEqual(seatDoc.seata[0].booked, false);
  assert.strictEqual(seatDoc.seata[0].bookedBy, null);
  assert.strictEqual(seatDoc.seata[0].bookedAt, null);

  assert.strictEqual(seatDoc.seatb[0].booked, false);
  assert.strictEqual(seatDoc.seatb[0].bookedBy, null);
  
  // un-matched seat remains untouched
  assert.strictEqual(seatDoc.seatc[0].booked, false);
});
