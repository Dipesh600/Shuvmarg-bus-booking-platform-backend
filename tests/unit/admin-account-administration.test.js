'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const guard = require('../../middleware/requireAccountAdministration');
const fs = require('node:fs');
const path = require('node:path');
for (const role of ['SUB_ADMIN', 'agent', 'passenger', undefined, 'ADMIN', 'SUPER_ADMIN']) {
  test(`account administration permission for ${role}`, () => {
    let allowed = false;
    const res = { once() {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
    guard({ adminInfo: { id: 'staff', role } }, res, () => { allowed = true; });
    assert.equal(allowed, ['ADMIN', 'SUPER_ADMIN'].includes(role));
    if (!allowed) assert.equal(res.code, 403);
  });
}
test('sensitive admin routes check permission after authentication and before handlers', () => {
  const routes = fs.readFileSync(path.join(__dirname, '../../routes/adminRoutes/adminRoutes.js'), 'utf8');
  for (const route of ['/resetPassword', '/makeUserAgent', '/busOwner/create', '/drivers', '/conductors']) {
    assert.ok(routes.includes(`"${route}", adminMiddleware, requireAccountAdministration`)
      || new RegExp(`"${route}",\\s+adminMiddleware, requireAccountAdministration`).test(routes), route);
  }
  assert.match(routes, /"\/busOwner\/:userId\/access-notification\/resend",\s+adminMiddleware,\s+requireAccountAdministration/);
});

test('authorized changes log actor, route and outcome without request secrets', t => {
  const { EventEmitter } = require('node:events');
  const logger = require('../../utils/logger');
  let entry;
  t.mock.method(logger, 'info', (message, metadata) => { entry = { message, ...metadata }; });
  const res = new EventEmitter(); res.statusCode = 200;
  const req = { adminInfo: { id: 'staff-id', role: 'ADMIN' }, method: 'POST', baseUrl: '/api/admin',
    route: { path: '/resetPassword' }, body: { password: 'private-canary' } };
  guard(req, res, () => {}); res.emit('finish');
  assert.equal(entry.administratorId, 'staff-id');
  assert.equal(entry.route, '/api/admin/resetPassword');
  assert.equal(entry.statusCode, 200);
  assert.doesNotMatch(JSON.stringify(entry), /private-canary/);
});
