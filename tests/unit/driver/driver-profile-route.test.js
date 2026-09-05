'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const router = require('../../../routes/driverRoutes/driverRoutes');
const auth = require('../../../middleware/authMiddleware');
const verifyRoleFromDB = require('../../../middleware/verifyRoleFromDB');
const { driverMiddleware } = require('../../../middleware/checkRole');
const profile = require('../../../src/modules/driver/profile');

const handlers = router.stack
  .find((layer) => layer.route?.path === '/me')
  .route.stack.map((layer) => layer.handle);

test('GET /api/driver/me uses the complete Driver authorization chain', () => {
  assert.deepEqual(handlers, [
    auth,
    verifyRoleFromDB,
    driverMiddleware,
    profile.getProfile,
  ]);
});

test('a non-Driver active role cannot enter the Driver profile route', () => {
  let statusCode;
  let body;
  driverMiddleware(
    { userInfo: { activeRole: 'agent' } },
    {
      status(code) {
        statusCode = code;
        return { json(value) { body = value; } };
      },
    },
    () => assert.fail('non-Driver role must not pass'),
  );
  assert.equal(statusCode, 403);
  assert.equal(body.errorCode, 'INSUFFICIENT_ROLE');
});
