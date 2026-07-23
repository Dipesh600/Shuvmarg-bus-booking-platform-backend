const { describe, it, mock } = require("node:test");
const assert = require("node:assert");
const { retireLegacyBookingFlow } = require("../../../src/modules/booking/legacy-booking-retirement");

describe("Legacy Booking Retirement Module", () => {
  it("should return a 410 status and LEGACY_BOOKING_FLOW_RETIRED message", (t) => {
    const req = {};
    const res = {
      status: mock.fn(() => res),
      json: mock.fn()
    };

    retireLegacyBookingFlow(req, res);

    assert.strictEqual(res.status.mock.calls.length, 1);
    assert.strictEqual(res.status.mock.calls[0].arguments[0], 410);

    assert.strictEqual(res.json.mock.calls.length, 1);
    assert.deepStrictEqual(res.json.mock.calls[0].arguments[0], {
      success: false,
      message: "This booking endpoint has been retired. Use the prepare and confirm booking flow.",
      errorCode: "LEGACY_BOOKING_FLOW_RETIRED"
    });
  });
});
