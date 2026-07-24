const test = require("node:test");
const assert = require("node:assert");
const { createTripSeatAvailabilityController } = require("../../../src/modules/booking/trip-seat-availability/trip-seat-availability.controller");

test("Trip seat availability controller", async (t) => {
  const originalConsoleError = console.error;
  const originalConsoleLog = console.log;

  let loggedError = false;
  
  t.beforeEach(() => {
    loggedError = false;
    console.error = () => { loggedError = true; };
    console.log = () => { loggedError = true; };
  });

  t.after(() => {
    console.error = originalConsoleError;
    console.log = originalConsoleLog;
  });

  await t.test("factory returns a function", () => {
    const handler = createTripSeatAvailabilityController();
    assert.strictEqual(typeof handler, "function");
  });

  const runHandler = async (service, req) => {
    const handler = createTripSeatAvailabilityController(service);
    let responseStatus, responseBody, nextCalled = false;
    const res = {
      status: (code) => {
        responseStatus = code;
        return {
          json: (body) => { responseBody = body; }
        };
      },
      json: (body) => { responseBody = body; }
    };
    const next = () => { nextCalled = true; };
    await handler(req, res, next);
    return { status: responseStatus, body: responseBody, nextCalled };
  };

  await t.test("missing tripId returns exact 400, service not called", async () => {
    let serviceCalled = false;
    const service = async () => { serviceCalled = true; };
    const req = { body: {} };
    
    const { status, body, nextCalled } = await runHandler(service, req);
    
    assert.strictEqual(status, 400);
    assert.deepStrictEqual(body, {
      status: false,
      message: "Please Provide Trip Id!"
    });
    assert.strictEqual(serviceCalled, false);
    assert.strictEqual(nextCalled, false);
  });

  await t.test("undefined body returns exact 500", async () => {
    const service = async () => {};
    const req = {};
    
    const { status, body, nextCalled } = await runHandler(service, req);
    
    assert.strictEqual(status, 500);
    assert.deepStrictEqual(body, {
      status: true,
      message: "Internal Server Error!"
    });
    assert.strictEqual(nextCalled, false);
    assert.ok(!loggedError);
  });

  await t.test("null service result returns exact 404", async () => {
    const service = async () => null;
    const req = { body: { tripId: "someId" } };
    
    const { status, body, nextCalled } = await runHandler(service, req);
    
    assert.strictEqual(status, 404);
    assert.deepStrictEqual(body, {
      status: false,
      message: "Seats Not Found!"
    });
    assert.strictEqual(nextCalled, false);
  });

  await t.test("success returns exact 200, service receives tripId and userInfo id, missing userInfo allowed", async () => {
    let receivedTripId, receivedUserId;
    const service = async (tripId, userId) => {
      receivedTripId = tripId;
      receivedUserId = userId;
      return { id: "seatId" };
    };
    
    const reqWithUser = { body: { tripId: "trip123" }, userInfo: { id: "user123" } };
    const resWithUser = await runHandler(service, reqWithUser);
    
    assert.strictEqual(resWithUser.status, 200);
    assert.deepStrictEqual(resWithUser.body, {
      status: true,
      message: "Successfully fetched seats!",
      data: { id: "seatId" }
    });
    assert.strictEqual(receivedTripId, "trip123");
    assert.strictEqual(receivedUserId, "user123");
    
    const reqWithoutUser = { body: { tripId: "trip456" } };
    const resWithoutUser = await runHandler(service, reqWithoutUser);
    
    assert.strictEqual(resWithoutUser.status, 200);
    assert.strictEqual(receivedTripId, "trip456");
    assert.ok(!receivedUserId);
  });

  await t.test("service error returns exact 500, no logging", async () => {
    const service = async () => { throw new Error("Service error"); };
    const req = { body: { tripId: "someId" } };
    
    const { status, body, nextCalled } = await runHandler(service, req);
    
    assert.strictEqual(status, 500);
    assert.deepStrictEqual(body, {
      status: true,
      message: "Internal Server Error!"
    });
    assert.strictEqual(nextCalled, false);
    assert.ok(!loggedError);
  });
});
