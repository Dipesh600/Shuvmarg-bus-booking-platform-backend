const { test } = require("node:test");
const assert = require("node:assert");
const { createPassengerBookingCancellationController } = require("../../../src/modules/booking/passenger-booking-cancellation/passenger-booking-cancellation.controller.js");
const { PassengerBookingCancellationValidationError } = require("../../../src/modules/booking/passenger-booking-cancellation/passenger-booking-cancellation-validation.error.js");

test("passenger-booking-cancellation-controller - success", async () => {
  let cancelCalled = false;
  let estimateCalled = false;

  const mockCancellationService = {
    cancelPassengerBooking: async () => {
      cancelCalled = true;
      return { id: 1 };
    }
  };

  const mockEstimateService = {
    estimatePassengerBookingCancellation: async () => {
      estimateCalled = true;
      return { est: 2 };
    }
  };

  const controller = createPassengerBookingCancellationController(mockCancellationService, mockEstimateService);

  const req = { body: {}, userInfo: { id: "user1" } };
  let statusCode;
  let jsonBody;
  const res = {
    status: (code) => {
      statusCode = code;
      return {
        json: (body) => {
          jsonBody = body;
        }
      }
    }
  };

  await controller.cancelPassengerBooking(req, res);
  assert.strictEqual(cancelCalled, true);
  assert.strictEqual(statusCode, 200);
  assert.strictEqual(jsonBody.status, true);

  await controller.estimatePassengerBookingCancellation(req, res);
  assert.strictEqual(estimateCalled, true);
  assert.strictEqual(statusCode, 200);
  assert.strictEqual(jsonBody.status, true);
});

test("passenger-booking-cancellation-controller - custom error", async () => {
  const mockCancellationService = {
    cancelPassengerBooking: async () => { throw new PassengerBookingCancellationValidationError(400, "bad request"); }
  };
  const mockEstimateService = {
    estimatePassengerBookingCancellation: async () => { throw new PassengerBookingCancellationValidationError(404, "not found"); }
  };

  const controller = createPassengerBookingCancellationController(mockCancellationService, mockEstimateService);
  const req = { body: {}, userInfo: { id: "user1" } };
  let statusCode, jsonBody;
  const res = {
    status: (code) => { statusCode = code; return { json: (body) => { jsonBody = body; } } }
  };

  await controller.cancelPassengerBooking(req, res);
  assert.strictEqual(statusCode, 400);
  assert.strictEqual(jsonBody.message, "bad request");

  await controller.estimatePassengerBookingCancellation(req, res);
  assert.strictEqual(statusCode, 404);
  assert.strictEqual(jsonBody.message, "not found");
});

test("passenger-booking-cancellation-controller - internal error", async (t) => {
  // temporarily mute console.error
  const origError = console.error;
  console.error = () => {};

  const mockCancellationService = {
    cancelPassengerBooking: async () => { throw new Error("internal"); }
  };
  const mockEstimateService = {
    estimatePassengerBookingCancellation: async () => { throw new Error("internal"); }
  };

  const controller = createPassengerBookingCancellationController(mockCancellationService, mockEstimateService);
  const req = { body: {}, userInfo: { id: "user1" } };
  let statusCode, jsonBody;
  const res = {
    status: (code) => { statusCode = code; return { json: (body) => { jsonBody = body; } } }
  };

  await controller.cancelPassengerBooking(req, res);
  assert.strictEqual(statusCode, 500);

  await controller.estimatePassengerBookingCancellation(req, res);
  assert.strictEqual(statusCode, 500);

  console.error = origError;
});
