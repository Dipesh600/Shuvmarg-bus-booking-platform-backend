'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
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
    name: `Agent Submit Success ${n}`,
    email: `agent-submit-success-${n}@example.test`,
    phone: `98788${n.padStart(5, '0')}`,
    password: credential(),
    role,
    roles: [role],
    status: 'active',
  });
};

const submitApp = (token, body) =>
  request(app).post('/api/agent/application/submit').set('Authorization', `Bearer ${token}`).send(body);

test('agent application submit success characterization', async (t) => {
  t.before(async () => db.connect());
  t.after(async () => db.disconnect());
  t.beforeEach(async () => db.clearAll());

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
