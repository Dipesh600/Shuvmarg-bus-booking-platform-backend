const test = require("node:test");
const assert = require("node:assert");
const { setupHarness } = require("../helpers/passenger-booking-cancellation-harness");

test("passenger-booking-cancellation outer error characterization", async (t) => {
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

  await t.test("outer error returns 500 and exact message", async () => {
    req.body = { ticketId: "T123" };
    req.userInfo = { id: "user1" };
    
    harness.mocks.bookingFindOne.mock.mockImplementationOnce(() => Promise.reject(new Error("Database Failure")));
    
    const origError = console.error;
    let errLogs = [];
    console.error = (...args) => { errLogs.push(args); };

    await harness.passengerBookingCancellation.cancelPassengerBooking(req, res);
    
    console.error = origError;

    assert.strictEqual(res.statusCode, 500);
    assert.deepStrictEqual(res.body, { status: false, message: "Internal Server Error" });
    
    assert.strictEqual(errLogs.length, 1);
    assert.strictEqual(errLogs[0][0], "Cancel Ticket Error:");
    assert.strictEqual(errLogs[0][1].message, "Database Failure");
  });
});
