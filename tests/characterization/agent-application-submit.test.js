'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const request = require('supertest');
const jwt = require('jsonwebtoken');

const db = require('../helpers/db');
const app = require('../helpers/app');
const User = require('../../models/userModel');
const Agent = require('../../models/agentModel');

let seq = 0;
const credential = () => `${crypto.randomBytes(24).toString('hex')}A1`;
const next = () => String(++seq).padStart(3, '0');

const tokenFor = (user, role = 'agent') => jwt.sign({
  id: user._id,
  name: user.name,
  role,
  roles: [role],
  activeRole: role,
  purpose: 'access',
  tokenVersion: user.tokenVersion || 0,
}, process.env.SECRET_KEY);

const seedUser = async (role = 'agent') => {
  const n = next();
  return User.create({
    name: `Agent Submit ${n}`,
    email: `agent-submit-${n}@example.test`,
    phone: `98787${n.padStart(5, '0')}`,
    password: credential(),
    role,
    roles: [role],
    status: 'active',
  });
};

const submitApp = (token, body) =>
  request(app).post('/api/agent/application/submit').set('Authorization', `Bearer ${token}`).send(body);

test('agent application submit characterization', async (t) => {
  t.before(async () => db.connect());
  t.after(async () => db.disconnect());
  t.beforeEach(async () => db.clearAll());

  await t.test('route keeps middleware order without requireApprovedAgent', async () => {
    const routeFile = fs.readFileSync('routes/agentRoute/agentRoute.js', 'utf8');
    assert.match(routeFile, /router\.post\("\/application\/submit", auth, verifyRoleFromDB, agentMiddleware, agentApplicationSubmit\.submitApplication\)/);
    assert.equal((await request(app).post('/api/agent/application/submit')).status, 401);
    
    const passenger = await seedUser('passenger');
    const wrongRole = await submitApp(tokenFor(passenger, 'passenger'), { termsAccepted: true });
    assert.equal(wrongRole.status, 403);
    assert.equal(wrongRole.body.errorCode, 'INSUFFICIENT_ROLE');
    assert.equal(routeFile.includes('"/application/submit", auth, verifyRoleFromDB, agentMiddleware, requireApprovedAgent'), false);
  });

  await t.test('returns 404 if agent not found', async () => {
    const user = await seedUser();
    const res = await submitApp(tokenFor(user), { termsAccepted: true });
    assert.equal(res.status, 404);
    assert.equal(res.body.success, false);
    assert.equal(res.body.message, 'No application found. Please start your application first.');
  });

  await t.test('returns 400 if termsAccepted is missing/false', async () => {
    const user = await seedUser();
    await Agent.create({ user: user._id, applicationStatus: 'DRAFT' });
    const res = await submitApp(tokenFor(user), {});
    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
    assert.equal(res.body.message, 'You must accept the Terms and Conditions to submit your application.');
  });

  await t.test('returns 403 if permanently rejected', async () => {
    const user = await seedUser();
    await Agent.create({ 
      user: user._id, 
      applicationStatus: 'REJECTED',
      isPermanentlyRejected: true 
    });
    const res = await submitApp(tokenFor(user), { termsAccepted: true });
    assert.equal(res.status, 403);
    assert.equal(res.body.errorCode, 'PERMANENTLY_REJECTED');
    assert.equal(res.body.message, 'Your application has been permanently rejected. Please contact support.');
  });

  await t.test('returns 429 if rejected and under 24 hours', async () => {
    const user = await seedUser();
    await Agent.create({ 
      user: user._id, 
      applicationStatus: 'REJECTED',
      rejectedAt: new Date(Date.now() - 1 * 60 * 60 * 1000) // 1 hour ago
    });
    const res = await submitApp(tokenFor(user), { termsAccepted: true });
    assert.equal(res.status, 429);
    assert.equal(res.body.errorCode, 'REAPPLY_TOO_SOON');
    assert.equal(res.body.hoursLeft, 23);
    assert.match(res.body.message, /You can reapply after 23 hour\(s\)\./);
  });

  await t.test('returns 400 if invalid status', async () => {
    const user = await seedUser();
    await Agent.create({ user: user._id, applicationStatus: 'PENDING' });
    const res = await submitApp(tokenFor(user), { termsAccepted: true });
    assert.equal(res.status, 400);
    assert.equal(res.body.message, 'Application is in "PENDING" status and cannot be submitted.');
  });

  await t.test('returns 400 with missing required fields', async () => {
    const user = await seedUser();
    await Agent.create({ user: user._id, applicationStatus: 'DRAFT', district: '', documents: [] });
    const res = await submitApp(tokenFor(user), { termsAccepted: true });
    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
    assert.equal(res.body.message, 'Application is incomplete. Please fix the following:');
    assert.equal(res.body.errors.includes('District is required.'), true);
    assert.equal(res.body.errors.includes('citizenship front document is required.'), true);
  });

  await t.test('submits successfully when perfectly valid', async () => {
    const user = await seedUser();
    const agent = await Agent.create({
      user: user._id,
      agentId: 'AGT-123456',
      applicationStatus: 'DRAFT',
      district: 'Kathmandu',
      municipality: 'KMC',
      placeName: 'Thamel',
      operationType: 'individual',
      shopAddress: 'Thamel-29',
      citizenshipNumber: '123-456',
      panNumber: '987654',
      documents: [
          { type: 'citizenship_front', url: 'url1', fileKey: 'key1' },
          { type: 'citizenship_back', url: 'url2', fileKey: 'key2' },
          { type: 'pan_card', url: 'url3', fileKey: 'key3' }
      ]
    });
    
    const res = await submitApp(tokenFor(user), { termsAccepted: true });
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.applicationStatus, 'PENDING');
    assert.equal(res.body.data.agentId, 'AGT-123456');
    assert.equal(typeof res.body.data.submittedAt, 'string');
    
    const updated = await Agent.findById(agent._id);
    assert.equal(updated.applicationStatus, 'PENDING');
    assert.equal(updated.submittedAt != null, true);
    assert.equal(updated.termsAcceptedAt != null, true);
    assert.equal(updated.rejectionReason, null);
    assert.equal(updated.moreInfoRequest, null);
    assert.equal(updated.moreInfoRequestedAt, null);
  });

  await t.test('submits successfully and resets if rejected > 24 hrs ago', async () => {
    const user = await seedUser();
    const agent = await Agent.create({
      user: user._id,
      agentId: 'AGT-123456',
      applicationStatus: 'REJECTED',
      rejectedAt: new Date(Date.now() - 25 * 60 * 60 * 1000), // 25 hours ago
      district: 'Kathmandu',
      municipality: 'KMC',
      placeName: 'Thamel',
      operationType: 'individual',
      shopAddress: 'Thamel-29',
      citizenshipNumber: '123-456',
      panNumber: '987654',
      documents: [
          { type: 'citizenship_front', url: 'url1', fileKey: 'key1' },
          { type: 'citizenship_back', url: 'url2', fileKey: 'key2' },
          { type: 'pan_card', url: 'url3', fileKey: 'key3' }
      ]
    });

    const res = await submitApp(tokenFor(user), { termsAccepted: true });
    assert.equal(res.status, 200);
    const updated = await Agent.findById(agent._id);
    assert.equal(updated.applicationStatus, 'PENDING');
  });
});
