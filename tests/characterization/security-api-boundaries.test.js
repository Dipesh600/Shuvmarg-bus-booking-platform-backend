'use strict';
process.env.NODE_ENV = 'test';
const { test, before, after, mock } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');
const fs = require('node:fs');
const rejectInput = require('../../middleware/rejectUnsafeInput');
const boundedUpload = require('../../middleware/boundedUpload');
const proxy = require('../../src/shared/http/trust-proxy');
const { redact } = require('../../utils/logRedaction');
const { annotateAddresses, MAX_GEOCODES } = require('../../src/shared/maps/bounded-geocoding');
const axios = require('axios');
const db = require('../helpers/db');
const { MongoRateLimitStore, Counter } = require('../../src/shared/http/mongo-rate-limit-store');
before(async () => { await db.connect(); await Counter.init(); });
after(async () => { mock.restoreAll(); await db.disconnect(); });

test('nested Mongo operators and prototype keys are rejected after parsing', async () => {
  const app = express(); app.set('query parser', 'extended');
  app.use(express.json(), express.urlencoded({ extended: true }), rejectInput);
  app.all('/input', (req, res) => res.json({ body: req.body, query: req.query }));
  for (const body of [{ phone: { $ne: null } }, { a: [{ 'profile.roles': 'admin' }] }, JSON.parse('{"__proto__":{"role":"admin"}}')]) {
    assert.equal((await request(app).post('/input').type('json').send(JSON.stringify(body))).status, 400);
  }
  assert.equal((await request(app).head('/input?phone[$ne]=x')).status, 400);
  assert.equal((await request(app).post('/input').type('form').send('phone[$ne]=x')).status, 400);
  const safe = await request(app).post('/input?limit=5').send({ name: 'Agent', documents: ['a.pdf'] });
  assert.equal(safe.status, 200); assert.deepEqual(safe.body.body, { name: 'Agent', documents: ['a.pdf'] });
  const source = fs.readFileSync(require.resolve('../../index'), 'utf8');
  assert.ok(source.indexOf('app.use(rejectUnsafeInput)') > source.indexOf('app.use(express.json'));
});
test('multipart request budget rejects oversized input before processing', async () => {
  const app = express(); let processed = 0;
  app.use(boundedUpload); app.post('/upload', (req, res) => { processed++; res.json({ ok: true }); });
  assert.equal((await request(app).post('/upload').attach('file', Buffer.from('small'), 'a.pdf')).status, 200);
  assert.equal((await request(app).post('/upload').set('Content-Type', 'multipart/form-data; boundary=abc').set('Content-Length', String(boundedUpload.MAX_REQUEST_BYTES + 100)).send('x')).status, 413);
  assert.equal(processed, 1);
});
test('trusted proxy uses the nearest forwarded client, direct mode ignores spoofed headers', async () => {
  const app = express(); proxy(app, { TRUSTED_PROXY_HOPS: '1' });
  app.get('/ip', (req, res) => res.json({ ip: req.ip }));
  assert.equal((await request(app).get('/ip').set('X-Forwarded-For', '192.0.2.99, 198.51.100.7')).body.ip, '198.51.100.7');
  assert.equal((await request(app).get('/ip').set('X-Forwarded-For', '198.51.100.8')).body.ip, '198.51.100.8');
  proxy(app, {});
  assert.notEqual((await request(app).get('/ip').set('X-Forwarded-For', '198.51.100.7')).body.ip, '198.51.100.7');
  assert.throws(() => proxy(app, { TRUSTED_PROXY_HOPS: 'true' }));
});
test('multiple processes share atomic rate counters; stale windows reset without TTL timing', async () => {
  let clock = new Date();
  const a = new MongoRateLimitStore('security-test', { now: () => clock });
  const b = new MongoRateLimitStore('security-test', { now: () => clock });
  a.init({ windowMs: 1000 }); b.init({ windowMs: 1000 });
  const values = await Promise.all(Array.from({ length: 20 }, (_, i) => (i % 2 ? a : b).increment('same-account')));
  assert.deepEqual(values.map(x => x.totalHits).sort((x, y) => x - y), Array.from({ length: 20 }, (_, i) => i + 1));
  const restarted = new MongoRateLimitStore('security-test', { now: () => clock }); restarted.init({ windowMs: 1000 });
  assert.equal((await restarted.increment('same-account')).totalHits, 21);
  clock = new Date(clock.getTime() + 1001);
  assert.equal((await b.increment('same-account')).totalHits, 1);
});
test('logs redact nested credentials and signed URLs without mutating input', () => {
  const input = { password: 'secret', request: { authorization: 'Bearer abc', url: 'https://s3.example/doc?signature=secret' }, message: 'Bearer abc' };
  const safe = redact(input);
  assert.equal(safe.password, '[REDACTED]'); assert.equal(input.password, 'secret');
  assert.equal(safe.request.authorization, '[REDACTED]');
  assert.doesNotMatch(safe.request.url, /signature=secret/);
  assert.doesNotMatch(safe.message, /abc/);
});
test('one route cannot generate unbounded paid geocoding calls', async () => {
  let calls = 0;
  mock.method(axios, 'get', async (url, options) => {
    calls++; assert.ok(options.timeout > 0 && options.timeout <= 3000);
    assert.equal(options.maxRedirects, 0);
    return { data: { results: [{ formatted_address: 'Test address' }] } };
  });
  const points = Array.from({ length: 10000 }, () => ({ lat: 27.7, lng: 85.3 }));
  await annotateAddresses(points, 1);
  assert.ok(calls <= MAX_GEOCODES); assert.ok(calls > 0);
  const initialCalls = calls;
  await annotateAddresses([{ lat: 27.7, lng: 85.3 }], 1);
  assert.equal(calls, initialCalls);
});
