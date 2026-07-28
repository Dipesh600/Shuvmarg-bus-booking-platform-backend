'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const policy = require('../../../../src/modules/agent/application-submit/agent-application-submit.policy');

test('agent-application-submit.policy', async (t) => {
    await t.test('allows submittable statuses', async () => {
        assert.equal(policy.isSubmittableStatus('DRAFT'), true);
        assert.equal(policy.isSubmittableStatus('MORE_INFO'), true);
    });

    await t.test('blocks non-submittable statuses', async () => {
        assert.equal(policy.isSubmittableStatus('PENDING'), false);
        assert.equal(policy.isSubmittableStatus('APPROVED'), false);
        assert.equal(policy.isSubmittableStatus('BLOCKED'), false);
    });
});
