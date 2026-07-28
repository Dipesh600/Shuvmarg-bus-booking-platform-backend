'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const mapper = require('../../../../src/modules/agent/application-status/agent-application-status.mapper');

test('application status mapper preserves exact response shapes', async (t) => {
  await t.test('no application uses request user name with legacy || null fallback', () => {
    assert.deepEqual(mapper.noApplication('Agent Name'), {
      success: true,
      message: 'No application started yet.',
      data: { applicationStatus: 'DRAFT', hasApplication: false, userName: 'Agent Name' },
    });
    assert.equal(mapper.noApplication('').data.userName, null);
  });

  await t.test('existing application exposes exact fields without mutating input', () => {
    const agent = {
      agentId: 'SHV-AG-STATUS',
      applicationStatus: 'APPROVED',
      agentType: 'DEFAULT',
      user: { name: 'Populated Name' },
      district: 'Kaski',
      businessName: 'Shop',
      citizenshipNumber: 'CIT',
      termsAcceptedAt: null,
      whatsappConsent: true,
      rejectionReason: null,
      moreInfoRequest: null,
      moreInfoRequestedAt: null,
      isPermanentlyRejected: false,
      extra: 'hidden',
    };
    const before = { ...agent };
    const result = mapper.applicationStatus(agent, [{ fileKey: 'x' }], {
      canReapply: false,
      reapplyAvailableAt: null,
    });
    assert.deepEqual(agent, before);
    assert.deepEqual(Object.keys(result.data), [
      'hasApplication', 'agentId', 'applicationStatus', 'agentType', 'submittedAt',
      'approvedAt', 'userName', 'personal', 'business', 'identification',
      'documents', 'consents', 'rejectionReason', 'moreInfoRequest',
      'moreInfoRequestedAt', 'isPermanentlyRejected', 'canReapply',
      'reapplyAvailableAt', 'createdAt', 'updatedAt',
    ]);
    assert.equal(result.data.userName, 'Populated Name');
    assert.equal(result.data.extra, undefined);
  });
});
