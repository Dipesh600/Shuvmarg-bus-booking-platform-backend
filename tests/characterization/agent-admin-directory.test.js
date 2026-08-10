'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const request = require('supertest');
const { createAdminToken } = require('../helpers/admin-token');

const db = require('../helpers/db');
const app = require('../helpers/app');
const User = require('../../models/userModel');
const Agent = require('../../models/agentModel');
const OperatorBrand = require('../../models/operatorBrandModel');
const s3Service = require('../../services/s3Service');

let seq = 0;
const credential = () => `${crypto.randomBytes(24).toString('hex')}A1`;
const next = () => String(++seq).padStart(3, '0');

const adminToken = async () => {
  const n = next();
  return createAdminToken({
    adminId: `SUMA-ADM-${n}`,
    email: `dir-admin-${n}@example.test`,
    password: credential(),
    role: 'SUPER_ADMIN',
  });
};

const seedUser = (n) => User.create({
  name: `Agent ${n}`, email: `agent-dir-${n}@example.test`, phone: `98456${n.padStart(5, '0')}`,
  password: credential(), role: 'agent', roles: ['agent'], status: 'active', profilePicture: `pic-${n}.jpg`,
});

const seedAgent = async (attrs = {}) => {
  const n = next();
  const user = attrs.user || await seedUser(n);
  return Agent.create({
    user: user._id, agentId: `SHV-AG-DIR-${n}`, applicationStatus: attrs.status || 'PENDING',
    agentType: attrs.type || 'DEFAULT', district: attrs.district, municipality: attrs.municipality,
    linkedOperatorId: attrs.linkedOperatorId, commissionRate: attrs.commissionRate ?? 5,
    commissionBalance: attrs.commissionBalance ?? 0, totalOnlineBookings: attrs.online ?? 0,
    totalCashBookings: attrs.cash ?? 0, operationType: attrs.operationType, submittedAt: attrs.submittedAt,
    documents: attrs.documents || [],
  });
};

const details = (token, body) =>
  request(app).post('/api/admin/getAgentDetails').set('Authorization', `Bearer ${token}`).send(body);
const list = (token, query = {}) =>
  request(app).get('/api/admin/getAllAgents').query(query).set('Authorization', `Bearer ${token}`);

test('agent admin directory characterization', async (t) => {
  t.before(async () => db.connect());
  t.after(async () => db.disconnect());
  t.beforeEach(async () => db.clearAll());

  await t.test('routes are admin-protected and validation/not-found responses are exact', async () => {
    assert.equal((await request(app).get('/api/admin/getAllAgents')).status, 401);
    const token = await adminToken();
    assert.deepEqual((await details(token, {})).body, { success: false, message: 'Id is required!' });
    const missing = await details(token, { id: 'SHV-AG-MISSING' });
    assert.equal(missing.status, 404);
    assert.deepEqual(missing.body, { success: false, message: 'Agent not found!' });
  });

  await t.test('details lookup order, user embedding and document URL handling are exact', async () => {
    const token = await adminToken();
    const agent = await seedAgent({ documents: [
      { type: 'citizenship_front', fileKey: 'agents/a/front.jpg' },
      { type: 'shop_photo', fileKey: 'https://cdn.example.test/shop.jpg' },
    ] });
    const original = s3Service.getPresignedUrl;
    s3Service.getPresignedUrl = async (key) => `https://preview.example.test/${key}`;
    try {
      for (const id of [String(agent.user), String(agent._id), agent.agentId]) {
        const res = await details(token, { id });
        assert.equal(res.status, 200);
        assert.equal(res.body.message, 'Agent details retrieved successfully!');
        assert.equal(res.body.data.profile.name, res.body.data.agentDetails.user.name);
        assert.equal(res.body.data.profile.password, undefined);
        assert.equal(res.body.data.agentDetails.documents[0].previewUrl, 'https://preview.example.test/agents/a/front.jpg');
        assert.equal(res.body.data.agentDetails.documents[1].previewUrl, undefined);
      }
    } finally {
      s3Service.getPresignedUrl = original;
    }
  });

  await t.test('listing preserves filters, mapping, fallbacks and messages', async () => {
    const token = await adminToken();
    assert.deepEqual((await list(token)).body, { success: true, message: 'No agents found.', results: 0, data: [] });
    const owner = await seedUser(next());
    const brand = await OperatorBrand.create({ ownerId: owner._id, brandName: 'Blue Bus', brandCode: `OB-${next()}` });
    await seedAgent({ status: 'APPROVED', type: 'OPERATOR_LINKED', linkedOperatorId: brand._id, district: 'Kaski',
      municipality: 'Pokhara', commissionRate: 7, commissionBalance: 42, online: 2, cash: 3, operationType: 'hotel' });
    await seedAgent({ status: 'PENDING', type: 'DEFAULT' });
    const all = await list(token);
    assert.equal(all.status, 200);
    assert.equal(all.body.message, 'Agents retrieved successfully!');
    assert.equal(all.body.results, 2);
    const linked = all.body.data.find((a) => a.agentType === 'OPERATOR_LINKED');
    assert.equal(linked.linkedOperator.name, 'Blue Bus');
    assert.equal(linked.location, 'Pokhara, Kaski');
    assert.equal(linked.commission, '7%');
    assert.equal(linked.totalBookings, 5);
    assert.equal((await list(token, { status: 'APPROVED' })).body.results, 1);
    assert.equal((await list(token, { type: 'DEFAULT' })).body.results, 1);
    assert.equal((await list(token, { status: 'APPROVED', type: 'DEFAULT' })).body.results, 0);
  });

  await t.test('unexpected failures preserve exact generic 500 bodies', async () => {
    const token = await adminToken();
    const originalFindOne = Agent.findOne;
    Agent.findOne = () => { throw new Error('details failed'); };
    try {
      assert.deepEqual((await details(token, { id: 'SHV-AG-ERR' })).body, { success: false, message: 'Internal Server Error!' });
    } finally {
      Agent.findOne = originalFindOne;
    }
    const originalFind = Agent.find;
    Agent.find = () => { throw new Error('list failed'); };
    try {
      assert.deepEqual((await list(token)).body, { success: false, message: 'Internal Server Error!' });
    } finally {
      Agent.find = originalFind;
    }
  });
});
