const test = require('node:test');
const assert = require('node:assert/strict');
const { createPassengerBookingPreparationController } = require('../../../src/modules/booking/passenger-booking-preparation/passenger-booking-preparation.controller.js');

function makeRes() {
  let _status, _json;
  const res = { status(c) { _status = c; return res; }, json(d) { _json = d; return res; } };
  return { res, getStatus: () => _status, getJson: () => _json };
}
function makeNext() { let _e; return { next: (e) => { _e = e; }, getErr: () => _e }; }

const VALID_REQ = (extra = {}) => ({
  body: { scheduleId: 't1', seatNumbers: ['A1'], originalAmount: 100 },
  dbUser: { _id: 'u1' }, userInfo: { activeRole: 'passenger' },
  ...extra,
});

test('passenger-booking-preparation controller tests', async (t) => {
  let svcCallCount = 0;
  function makeSvc(result) {
    svcCallCount = 0;
    return { async preparePassengerBooking() { svcCallCount++; if (result instanceof Error) throw result; return result; } };
  }
  const ctrl = (svc) => createPassengerBookingPreparationController({ service: svc });

  await t.test('1. empty body => HTTP 400, service not called', async () => {
    const { res, getStatus, getJson } = makeRes();
    await ctrl(makeSvc({})).preparePassengerBooking({ body: {} }, res, makeNext().next);
    assert.equal(getStatus(), 400);
    assert.equal(getJson().success, false);
    assert.equal(svcCallCount, 0);
  });

  await t.test('2. missing req.dbUser => HTTP 500, service not called', async () => {
    const origErr = console.error; console.error = () => {};
    try {
      const { res, getStatus, getJson } = makeRes();
      await ctrl(makeSvc({ statusCode: 200, body: { success: true } })).preparePassengerBooking(
        { body: VALID_REQ().body, userInfo: { activeRole: 'passenger' } }, res, makeNext().next
      );
      assert.equal(getStatus(), 500);
      assert.deepEqual(getJson(), { success: false, message: 'Internal Server Error!' });
      assert.equal(svcCallCount, 0);
    } finally { console.error = origErr; }
  });

  await t.test('3. missing req.userInfo => HTTP 500, service not called', async () => {
    const origErr = console.error; console.error = () => {};
    try {
      const { res, getStatus, getJson } = makeRes();
      await ctrl(makeSvc({ statusCode: 200, body: { success: true } })).preparePassengerBooking(
        { body: VALID_REQ().body, dbUser: { _id: 'u1' } }, res, makeNext().next
      );
      assert.equal(getStatus(), 500);
      assert.deepEqual(getJson(), { success: false, message: 'Internal Server Error!' });
      assert.equal(svcCallCount, 0);
    } finally { console.error = origErr; }
  });

  await t.test('4. service rejection => HTTP 500 Internal Server Error', async () => {
    const origErr = console.error; console.error = () => {};
    try {
      const { res, getStatus, getJson } = makeRes();
      await ctrl(makeSvc(new Error('unexpected'))).preparePassengerBooking(VALID_REQ(), res, makeNext().next);
      assert.equal(getStatus(), 500);
      assert.deepEqual(getJson(), { success: false, message: 'Internal Server Error!' });
    } finally { console.error = origErr; }
  });

  await t.test('5. error with statusCode is forwarded to next(error)', async () => {
    const { res } = makeRes(); const { next, getErr } = makeNext();
    const appErr = Object.assign(new Error('AppError'), { statusCode: 403 });
    await ctrl(makeSvc(appErr)).preparePassengerBooking(VALID_REQ(), res, next);
    assert.equal(getErr(), appErr);
  });

  await t.test('6. valid context passes exact userId and activeRole to service', async () => {
    let cap = null;
    const svc = { async preparePassengerBooking(a) { cap = a; return { statusCode: 200, body: { success: true } }; } };
    const { res } = makeRes();
    await createPassengerBookingPreparationController({ service: svc }).preparePassengerBooking(
      { body: VALID_REQ().body, dbUser: { _id: 'user-abc' }, userInfo: { activeRole: 'passenger' } }, res, makeNext().next
    );
    assert.equal(cap.userId, 'user-abc');
    assert.equal(cap.activeRole, 'passenger');
  });

  await t.test('7. successful service result written with exact statusCode and body', async () => {
    const svc = { async preparePassengerBooking() { return { statusCode: 201, body: { success: true, data: { x: 1 } } }; } };
    const { res, getStatus, getJson } = makeRes();
    await createPassengerBookingPreparationController({ service: svc }).preparePassengerBooking(VALID_REQ(), res, makeNext().next);
    assert.equal(getStatus(), 201);
    assert.deepEqual(getJson(), { success: true, data: { x: 1 } });
  });
});
