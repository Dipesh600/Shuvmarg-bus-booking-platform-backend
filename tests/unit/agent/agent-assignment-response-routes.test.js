'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const router = require('../../../routes/agentRoute/agentRoute');
const auth = require('../../../middleware/authMiddleware');
const verifyRoleFromDB = require('../../../middleware/verifyRoleFromDB');
const { agentMiddleware } = require('../../../middleware/checkRole');
const limiter = require('../../../middleware/agentAssignmentRespondRateLimit');
const response = require('../../../src/modules/agent/assignment-response');

const handlersFor = (path) => router.stack
  .find((layer) => layer.route?.path === path)
  .route.stack.map((layer) => layer.handle);

test('assignment response route security wiring', async (t) => {
  await t.test('accept uses exact auth chain, limiter, then controller', () => {
    assert.deepEqual(handlersFor('/assignments/:assignmentId/accept'), [
      auth, verifyRoleFromDB, agentMiddleware, limiter, response.acceptAssignment,
    ]);
  });

  await t.test('decline uses exact auth chain, limiter, then controller', () => {
    assert.deepEqual(handlersFor('/assignments/:assignmentId/decline'), [
      auth, verifyRoleFromDB, agentMiddleware, limiter, response.declineAssignment,
    ]);
  });

  await t.test('S12 both endpoints share the exact per-agent rate-limit key', () => {
    const source = fs.readFileSync(path.join(
      __dirname,
      '../../../middleware/agentAssignmentRespondRateLimit.js',
    ), 'utf8');
    assert.match(source, /max: 30,/);
    assert.match(source, /`agent-assignment-respond:\$\{req\.userInfo\?\.id \|\| req\.ip\}`/);
    assert.equal(handlersFor('/assignments/:assignmentId/accept')[3], limiter);
    assert.equal(handlersFor('/assignments/:assignmentId/decline')[3], limiter);
  });
});
