const { describe, it, mock, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert");
const { createPassengerBookingHistoryController } = require("../../../src/modules/booking/passenger-booking-history/passenger-booking-history.controller");

describe("Passenger Booking History Controller", () => {
  let mockService;
  let req, res;
  let handler;
  let consoleError;

  beforeEach(() => {
    mockService = {
      getPassengerBookingHistory: mock.fn(async () => [{ id: 1 }, { id: 2 }])
    };
    
    handler = createPassengerBookingHistoryController(mockService);
    
    req = {
      userInfo: { id: "user123" }
    };
    
    res = {
      status: mock.fn(() => res),
      json: mock.fn(() => res)
    };
    
    consoleError = mock.method(console, 'error', () => {});
  });

  afterEach(() => {
    mock.restoreAll();
  });

  it("success returns { status: true, message: '...', data: result }", async () => {
    await handler(req, res);
    assert.strictEqual(mockService.getPassengerBookingHistory.mock.calls[0].arguments[0], "user123");
    assert.strictEqual(res.status.mock.calls[0].arguments[0], 200);
    assert.deepStrictEqual(res.json.mock.calls[0].arguments[0], {
      status: true,
      message: "Successfully fetched Booking History",
      data: [{ id: 1 }, { id: 2 }]
    });
  });

  it("caught errors log via console.error and return status 500", async () => {
    const error = new Error("Service failed");
    mockService.getPassengerBookingHistory.mock.mockImplementation(async () => { throw error; });
    
    await handler(req, res);
    
    assert.strictEqual(consoleError.mock.callCount(), 1);
    assert.strictEqual(consoleError.mock.calls[0].arguments[0], error);
    
    assert.strictEqual(res.status.mock.calls[0].arguments[0], 500);
    assert.deepStrictEqual(res.json.mock.calls[0].arguments[0], {
      status: false,
      message: "Internal Server Error"
    });
  });
});
