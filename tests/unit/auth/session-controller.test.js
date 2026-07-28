'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { mock } = require('node:test');
const sessionController = require('../../../src/modules/auth/session/session.controller');
const sessionService = require('../../../src/modules/auth/session/session.service');
const AppError = require('../../../src/shared/errors/app-error');

test('Auth: Session Controller', async (t) => {
  let req, res, next;

  t.beforeEach(() => {
    req = {
      cookies: {},
      body: {},
      get: mock.fn(),
      ip: '127.0.0.1',
      userInfo: {},
    };
    res = {
      status: mock.fn(() => res),
      json: mock.fn(),
      cookie: mock.fn(),
      clearCookie: mock.fn(),
    };
    next = mock.fn();
    mock.method(sessionService, 'refreshSession');
    mock.method(sessionService, 'logoutSession');
  });

  t.afterEach(() => {
    mock.restoreAll();
  });

  await t.test('refreshAccessToken - success via cookie', async () => {
    req.cookies.refreshToken = 'cookie-token';
    req.get.mock.mockImplementation((h) => (h === 'User-Agent' ? 'test-agent' : null));

    sessionService.refreshSession.mock.mockImplementation(() => Promise.resolve({
      statusCode: 200,
      refreshToken: 'new-refresh-token',
      responseBody: { success: true, message: 'Token refreshed successfully.', accessToken: 'new-access-token' },
    }));

    await sessionController.refreshAccessToken(req, res, next);

    assert.equal(sessionService.refreshSession.mock.callCount(), 1);
    assert.deepEqual(sessionService.refreshSession.mock.calls[0].arguments[0], {
      refreshToken: 'cookie-token',
      deviceInfo: 'test-agent',
      ipAddress: '127.0.0.1',
    });
    assert.equal(res.cookie.mock.callCount(), 1);
    assert.equal(res.cookie.mock.calls[0].arguments[0], 'refreshToken');
    assert.equal(res.cookie.mock.calls[0].arguments[1], 'new-refresh-token');
    assert.equal(res.status.mock.callCount(), 1);
    assert.equal(res.status.mock.calls[0].arguments[0], 200);
    assert.deepEqual(res.json.mock.calls[0].arguments[0], {
      success: true,
      message: 'Token refreshed successfully.',
      accessToken: 'new-access-token',
    });
    assert.equal(next.mock.callCount(), 0);
  });

  await t.test('refreshAccessToken - error calls next', async () => {
    const error = new AppError('Testing error', 400);
    sessionService.refreshSession.mock.mockImplementation(() => Promise.reject(error));

    await sessionController.refreshAccessToken(req, res, next);

    assert.equal(next.mock.callCount(), 1);
    assert.equal(next.mock.calls[0].arguments[0], error);
  });

  await t.test('logout - success with refresh token and userId', async () => {
    req.cookies.refreshToken = 'logout-token';
    req.userInfo.id = 'user-123';

    sessionService.logoutSession.mock.mockImplementation(() => Promise.resolve({
      statusCode: 200,
      responseBody: { success: true, message: 'Logged out successfully.' },
    }));

    await sessionController.logout(req, res, next);

    // clearCookie is called unconditionally (before service)
    assert.equal(res.clearCookie.mock.callCount(), 1);
    assert.equal(res.clearCookie.mock.calls[0].arguments[0], 'refreshToken');

    assert.equal(sessionService.logoutSession.mock.callCount(), 1);
    assert.deepEqual(sessionService.logoutSession.mock.calls[0].arguments[0], {
      refreshToken: 'logout-token',
      userId: 'user-123',
    });
    assert.equal(res.status.mock.callCount(), 1);
    assert.equal(res.status.mock.calls[0].arguments[0], 200);
    assert.deepEqual(res.json.mock.calls[0].arguments[0], {
      success: true,
      message: 'Logged out successfully.',
    });
    assert.equal(next.mock.callCount(), 0);
  });

  await t.test('logout - clearCookie is called before logoutSession', async () => {
    const callOrder = [];
    res.clearCookie.mock.mockImplementation(() => { callOrder.push('clearCookie'); });
    sessionService.logoutSession.mock.mockImplementation(() => {
      callOrder.push('logoutSession');
      return Promise.resolve({ statusCode: 200, responseBody: { success: true, message: 'Logged out successfully.' } });
    });

    await sessionController.logout(req, res, next);

    assert.deepEqual(callOrder, ['clearCookie', 'logoutSession'],
      'clearCookie must be called before logoutSession');
  });

  await t.test('logout - cookie cleared even without a token', async () => {
    sessionService.logoutSession.mock.mockImplementation(() => Promise.resolve({
      statusCode: 200,
      responseBody: { success: true, message: 'Logged out successfully.' },
    }));

    await sessionController.logout(req, res, next);

    assert.equal(res.clearCookie.mock.callCount(), 1);
    assert.equal(res.clearCookie.mock.calls[0].arguments[0], 'refreshToken');
  });
});
