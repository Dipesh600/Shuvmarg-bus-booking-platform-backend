'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const axios = require('axios');

const db = require('../helpers/db');
const app = require('../helpers/app');
const User = require('../../models/userModel');
const Agent = require('../../models/agentModel');
const SuperAdmin = require('../../models/adminModel');
const LocalNotification = require('../../models/localNotificationModel');

let seq = 0;
const credential = () => `${crypto.randomBytes(24).toString('hex')}A1`;
const id = () => String(++seq).padStart(3, '0');

const adminAccess = async () => {
  const n = id();
  const admin = await SuperAdmin.create({
    adminId: `SUMA-ADM-${n}`,
    email: `admin${n}@example.test`,
    password: credential(),
    role: 'SUPER_ADMIN',
  });
  return jwt.sign({ id: admin._id, role: 'SUPER_ADMIN', purpose: 'access' }, process.env.SECRET_KEY);
};

const seedAgent = async (extra = {}) => {
  const n = id();
  const user = await User.create({
    name: `Agent ${n}`,
    email: `agent${n}@example.test`,
    phone: `98123${n.padStart(5, '0')}`,
    password: credential(),
    role: 'agent',
    roles: ['agent'],
    status: 'active',
  });
  const agent = await Agent.create({
    user: user._id,
    agentId: `SHV-AG-T${n}`,
    applicationStatus: 'PENDING',
    documents: [
      { type: 'citizenship_front', fileKey: `agents/${n}/front.jpg`, verified: false },
      { type: 'pan_card', fileKey: `agents/${n}/pan.jpg`, verified: false },
    ],
    ...extra,
  });
  return { user, agent };
};

const authPatch = async (body, token) =>
  request(app).patch('/api/admin/agentKycStatus').set('Authorization', `Bearer ${token}`).send(body);

const patchNotifications = (state, options = {}) => {
  const originalTransport = nodemailer.createTransport;
  const originalPost = axios.post;
  nodemailer.createTransport = () => ({
    sendMail: async (mail) => {
      state.emails.push(mail);
      if (options.emailThrows) throw new Error('email fail');
    },
  });
  axios.post = async (url, payload) => {
    state.sms.push({ url, payload });
    if (options.smsThrows) throw new Error('sms fail');
    return { data: { ok: true } };
  };
  return () => {
    nodemailer.createTransport = originalTransport;
    axios.post = originalPost;
  };
};

test('agent KYC admin review characterization', async (t) => {
  t.before(async () => db.connect());
  t.after(async () => db.disconnect());
  t.beforeEach(async () => db.clearAll());

  await t.test('lookup by user id, agent object id, agentId and not found response', async () => {
    const token = await adminAccess();
    const byUser = await seedAgent();
    const byAgent = await seedAgent();
    const byAgentId = await seedAgent();
    assert.equal((await authPatch({ id: byUser.user._id, adminNotes: 'user id' }, token)).status, 200);
    assert.equal((await authPatch({ id: byAgent.agent._id, adminNotes: 'agent oid' }, token)).status, 200);
    assert.equal((await authPatch({ id: byAgentId.agent.agentId, adminNotes: 'agent id' }, token)).status, 200);
    const missing = await authPatch({ id: 'SHV-AG-MISSING' }, token);
    assert.equal(missing.status, 404);
    assert.deepEqual(missing.body, { success: false, message: 'Agent not found!' });
  });

  await t.test('document-only update verifies/rejects documents and sends no notifications', async () => {
    const token = await adminAccess();
    const { agent } = await seedAgent();
    const state = { emails: [], sms: [] };
    const restore = patchNotifications(state);
    try {
      const res = await authPatch({
        id: agent.agentId,
        documentVerifications: [
          { type: 'citizenship_front', verified: true },
          { type: 'pan_card', verified: false, rejectionReason: 'Blurry image' },
        ],
        commissionRate: 7,
        minSettlementThreshold: 900,
        adminNotes: 'docs checked',
      }, token);
      assert.deepEqual(res.body, { success: true, message: 'Agent application updated successfully!' });
      const saved = await Agent.findById(agent._id);
      const front = saved.documents.find((d) => d.type === 'citizenship_front');
      const pan = saved.documents.find((d) => d.type === 'pan_card');
      assert.equal(front.verified, true);
      assert.equal(String(front.verifiedBy), jwt.decode(token).id);
      assert.ok(front.verifiedAt instanceof Date);
      assert.equal(front.rejectionReason, null);
      assert.equal(pan.verified, false);
      assert.equal(pan.rejectionReason, 'Blurry image');
      assert.equal(saved.commissionRate, 7);
      assert.equal(saved.minSettlementThreshold, 900);
      assert.equal(saved.adminNotes, 'docs checked');
      assert.deepEqual(state, { emails: [], sms: [] });
      assert.equal(await LocalNotification.countDocuments({ user: agent.user }), 0);
    } finally {
      restore();
    }
  });

});
