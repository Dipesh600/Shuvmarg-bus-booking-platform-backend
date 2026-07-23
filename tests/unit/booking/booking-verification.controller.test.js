'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const controller = require('../../../src/modules/booking/booking-verification/booking-verification.controller');
const service = require('../../../src/modules/booking/booking-verification/verify-booking.service');

const mockResponse = () => {
  const res = {};
  res.statusCode = null;
  res.body = null;
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body) => {
    res.body = body;
    return res;
  };
  return res;
};

const patch = (obj, key, fn) => {
  const old = obj[key];
  obj[key] = fn;
  return () => { obj[key] = old; };
};

test('booking-verification controller unit tests', async (t) => {
  await t.test('reads req.params.ticketId and req.userInfo.id and passes to service', async () => {
    let capturedInput;
    const restore = patch(service, 'verifyPassengerBooking', async (input) => {
      capturedInput = input;
      return {
        statusCode: 200,
        responseBody: { success: true, message: 'verified' },
      };
    });

    try {
      const req = {
        params: { ticketId: 'TKT-888' },
        userInfo: { id: 'usr-999' },
      };
      const res = mockResponse();

      await controller.verifyBooking(req, res);

      assert.deepEqual(capturedInput, { ticketId: 'TKT-888', userId: 'usr-999' });
      assert.equal(res.statusCode, 200);
      assert.deepEqual(res.body, { success: true, message: 'verified' });
    } finally {
      restore();
    }
  });

  await t.test('sends service status code and response body unchanged', async () => {
    const serviceResult = {
      statusCode: 404,
      responseBody: { success: false, message: 'Booking not found!' },
    };
    const restore = patch(service, 'verifyPassengerBooking', async () => serviceResult);

    try {
      const req = {
        params: { ticketId: 'TKT-NOT-FOUND' },
        userInfo: { id: 'usr-1' },
      };
      const res = mockResponse();

      await controller.verifyBooking(req, res);

      assert.equal(res.statusCode, 404);
      assert.deepEqual(res.body, { success: false, message: 'Booking not found!' });
    } finally {
      restore();
    }
  });

  await t.test('unexpected service failure returns exact existing 500 response', async () => {
    const restore = patch(service, 'verifyPassengerBooking', async () => {
      throw new Error('Database connection failed');
    });

    const consoleError = console.error;
    console.error = () => {}; // suppress error output in test

    try {
      const req = {
        params: { ticketId: 'TKT-ERR' },
        userInfo: { id: 'usr-1' },
      };
      const res = mockResponse();

      await controller.verifyBooking(req, res);

      assert.equal(res.statusCode, 500);
      assert.deepEqual(res.body, {
        success: false,
        message: 'Internal Server Error!',
      });
    } finally {
      console.error = consoleError;
      restore();
    }
  });
});
