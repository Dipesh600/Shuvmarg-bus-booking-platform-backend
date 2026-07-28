'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const service = require('../../../src/modules/kyc/agent-review/agent-kyc-review.service');
const repository = require('../../../src/modules/kyc/agent-review/agent-kyc-review.repository');

const patchUpdateUser = (calls) => {
  const original = repository.updateUser;
  repository.updateUser = async (userId, update) => {
    calls.push({ userId, update });
  };
  return () => {
    repository.updateUser = original;
  };
};

test('agent KYC review service preserves document review behavior', () => {
  const agent = {
    documents: [
      { type: 'citizenship_front', verified: false, rejectionReason: 'Old' },
      { type: 'pan_card', verified: false, rejectionReason: null },
    ],
  };
  service.applyDocumentReviews(agent, [
    { type: 'citizenship_front', verified: true },
    { type: 'pan_card', verified: false, rejectionReason: 'Blurry image' },
    { type: 'missing_doc', verified: true },
  ], 'admin-1');

  assert.equal(agent.documents[0].verified, true);
  assert.equal(agent.documents[0].verifiedBy, 'admin-1');
  assert.ok(agent.documents[0].verifiedAt instanceof Date);
  assert.equal(agent.documents[0].rejectionReason, null);
  assert.equal(agent.documents[1].verified, false);
  assert.equal(agent.documents[1].rejectionReason, 'Blurry image');
});

test('agent KYC review service preserves rejection behavior', async () => {
  const calls = [];
  const restore = patchUpdateUser(calls);
  const agent = { user: 'user-1', applicationStatus: 'PENDING' };
  try {
    await service.syncStatus(agent, {
      applicationStatus: 'REJECTED',
      rejectionReason: 'Bad documents',
      isPermanentlyRejected: true,
    }, 'admin-1');
  } finally {
    restore();
  }

  assert.equal(agent.applicationStatus, 'REJECTED');
  assert.equal(agent.rejectionReason, 'Bad documents');
  assert.equal(agent.isPermanentlyRejected, true);
  assert.deepEqual(calls, [{ userId: 'user-1', update: { isVerified: false } }]);
});

test('agent KYC review service preserves suspension behavior', async () => {
  const calls = [];
  const restore = patchUpdateUser(calls);
  const agent = { user: 'user-2', applicationStatus: 'APPROVED' };
  try {
    await service.syncStatus(agent, {
      applicationStatus: 'SUSPENDED',
      rejectionReason: 'Fraud check',
    }, 'admin-2');
  } finally {
    restore();
  }

  assert.equal(agent.applicationStatus, 'SUSPENDED');
  assert.ok(agent.suspendedAt instanceof Date);
  assert.equal(agent.suspendedBy, 'admin-2');
  assert.equal(agent.suspensionReason, 'Fraud check');
  assert.deepEqual(calls, [{ userId: 'user-2', update: { status: 'inactive' } }]);
});

test('agent KYC review service preserves suspended-agent reactivation behavior', async () => {
  const calls = [];
  const restore = patchUpdateUser(calls);
  const agent = {
    user: 'user-3',
    applicationStatus: 'SUSPENDED',
    suspendedAt: new Date(),
    suspendedBy: 'admin-old',
    suspensionReason: 'Old reason',
  };
  try {
    await service.syncStatus(agent, { applicationStatus: 'APPROVED' }, 'admin-3');
  } finally {
    restore();
  }

  assert.equal(agent.applicationStatus, 'APPROVED');
  assert.ok(agent.approvedAt instanceof Date);
  assert.equal(agent.approvedBy, 'admin-3');
  assert.equal(agent.rejectionReason, null);
  assert.equal(agent.moreInfoRequest, null);
  assert.equal(agent.suspendedAt, null);
  assert.equal(agent.suspendedBy, null);
  assert.equal(agent.suspensionReason, null);
  assert.deepEqual(calls, [
    { userId: 'user-3', update: { isVerified: true, status: 'active' } },
    { userId: 'user-3', update: { status: 'active', isVerified: true } },
  ]);
});
