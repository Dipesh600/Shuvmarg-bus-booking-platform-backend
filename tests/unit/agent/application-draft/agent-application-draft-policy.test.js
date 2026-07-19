'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const policy = require('../../../../src/modules/agent/application-draft/agent-application-draft.policy');

test('agent application draft policy', async (t) => {
    await t.test('DRAFT is editable', () => {
        assert.equal(policy.isEditableStatus('DRAFT'), true);
    });

    await t.test('MORE_INFO is editable', () => {
        assert.equal(policy.isEditableStatus('MORE_INFO'), true);
    });

    await t.test('PENDING is not editable', () => {
        assert.equal(policy.isEditableStatus('PENDING'), false);
    });

    await t.test('APPROVED is not editable', () => {
        assert.equal(policy.isEditableStatus('APPROVED'), false);
    });

    await t.test('REJECTED is not editable', () => {
        assert.equal(policy.isEditableStatus('REJECTED'), false);
    });

    await t.test('SUSPENDED is not editable', () => {
        assert.equal(policy.isEditableStatus('SUSPENDED'), false);
    });

    await t.test('undefined is not editable', () => {
        assert.equal(policy.isEditableStatus(undefined), false);
    });

    await t.test('null is not editable', () => {
        assert.equal(policy.isEditableStatus(null), false);
    });
});
