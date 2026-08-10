'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const request = require('supertest');
const { createAdminToken } = require('../helpers/admin-token');
const nodemailer = require('nodemailer');
const axios = require('axios');

const db = require('../helpers/db');
const app = require('../helpers/app');
const User = require('../../models/userModel');
const Agent = require('../../models/agentModel');
const UserDeviceInfo = require('../../models/userDeviceInfoModel');
const LocalNotification = require('../../models/localNotificationModel');

let seq = 100;
const credential = () => `${crypto.randomBytes(24).toString('hex')}A1`;
const id = () => String(++seq).padStart(3, '0');

const adminAccess = async () => {
  const n = id();
  return createAdminToken({
    adminId: `SUMA-ADM-${n}`,
    email: `admin${n}@example.test`,
    password: credential(),
    role: 'SUPER_ADMIN',
  });
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
    agentId: `SHV-AG-S${n}`,
    applicationStatus: 'PENDING',
    documents: [{ type: 'pan_card', fileKey: `agents/${n}/pan.jpg`, verified: false }],
    ...extra,
  });
  return { user, agent };
};

const authPatch = (body, token) =>
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

test('agent KYC status review characterization', async (t) => {
  t.before(async () => db.connect());
  t.after(async () => db.disconnect());
  t.beforeEach(async () => db.clearAll());

  await t.test('approval, rejection, more-info, suspension and reactivation preserve fields', async () => {
    const token = await adminAccess();
    const approved = await seedAgent();
    const rejected = await seedAgent();
    const more = await seedAgent();
    const suspended = await seedAgent({ applicationStatus: 'APPROVED' });
    const reactivate = await seedAgent({ applicationStatus: 'SUSPENDED', suspensionReason: 'Old' });
    const state = { emails: [], sms: [] };
    const restore = patchNotifications(state);
    try {
      await authPatch({ id: approved.agent.agentId, applicationStatus: 'APPROVED' }, token);
      await authPatch({ id: rejected.agent.agentId, applicationStatus: 'REJECTED', rejectionReason: 'Bad docs', isPermanentlyRejected: true }, token);
      await authPatch({ id: more.agent.agentId, applicationStatus: 'MORE_INFO', moreInfoRequest: 'Upload PAN' }, token);
      await authPatch({ id: suspended.agent.agentId, applicationStatus: 'SUSPENDED', rejectionReason: 'Fraud check' }, token);
      await authPatch({ id: reactivate.agent.agentId, applicationStatus: 'APPROVED' }, token);
      assert.equal((await Agent.findById(approved.agent._id)).applicationStatus, 'APPROVED');
      assert.equal((await User.findById(approved.user._id)).isVerified, true);
      const r = await Agent.findById(rejected.agent._id);
      assert.equal(r.rejectionReason, 'Bad docs');
      assert.equal(r.isPermanentlyRejected, true);
      assert.equal((await User.findById(rejected.user._id)).isVerified, false);
      assert.equal((await Agent.findById(more.agent._id)).moreInfoRequest, 'Upload PAN');
      assert.equal((await User.findById(suspended.user._id)).status, 'inactive');
      const reactivated = await Agent.findById(reactivate.agent._id);
      assert.equal(reactivated.suspensionReason, null);
      assert.equal((await User.findById(reactivate.user._id)).status, 'active');
      assert.equal(state.sms.length, 5);
      assert.equal(state.emails.length, 5);
      assert.equal(await LocalNotification.countDocuments(), 5);
    } finally {
      restore();
    }
  });

  await t.test('notification failures remain non-fatal and unexpected errors return generic 500', async () => {
    const token = await adminAccess();
    const ok = await seedAgent();
    await UserDeviceInfo.create({
      userId: ok.user._id,
      token: crypto.randomBytes(24).toString('hex'),
    });
    const state = { emails: [], sms: [] };
    const restore = patchNotifications(state, { emailThrows: true, smsThrows: true });
    try {
      const res = await authPatch({ id: ok.agent.agentId, applicationStatus: 'APPROVED' }, token);
      assert.equal(res.status, 200);
      assert.deepEqual(res.body, { success: true, message: 'Agent application updated successfully!' });
    } finally {
      restore();
    }
    const original = Agent.findOne;
    Agent.findOne = () => { throw new Error('db boom'); };
    try {
      const failed = await authPatch({ id: ok.agent.agentId }, token);
      assert.equal(failed.status, 500);
      assert.deepEqual(failed.body, { success: false, message: 'Internal Server Error!' });
    } finally {
      Agent.findOne = original;
    }
  });
});
