'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const policy = require('../../../../src/modules/agent/application-document-upload/agent-application-document-upload.policy');

const EXPECTED_TYPES = [
    'citizenship_front',
    'citizenship_back',
    'national_id_front',
    'national_id_back',
    'shop_photo',
    'pan_card',
    'business_registration',
];

test('agent application document upload policy', async (t) => {
    await t.test('DRAFT is uploadable', () => { assert.equal(policy.isUploadableStatus('DRAFT'), true); });
    await t.test('MORE_INFO is uploadable', () => { assert.equal(policy.isUploadableStatus('MORE_INFO'), true); });
    await t.test('PENDING is not uploadable', () => { assert.equal(policy.isUploadableStatus('PENDING'), false); });
    await t.test('APPROVED is not uploadable', () => { assert.equal(policy.isUploadableStatus('APPROVED'), false); });
    await t.test('REJECTED is not uploadable', () => { assert.equal(policy.isUploadableStatus('REJECTED'), false); });
    await t.test('SUSPENDED is not uploadable', () => { assert.equal(policy.isUploadableStatus('SUSPENDED'), false); });
    await t.test('undefined is not uploadable', () => { assert.equal(policy.isUploadableStatus(undefined), false); });
    await t.test('null is not uploadable', () => { assert.equal(policy.isUploadableStatus(null), false); });

    await t.test('VALID_DOCUMENT_TYPES contains exactly the 7 expected types', () => {
        assert.deepEqual([...policy.VALID_DOCUMENT_TYPES].sort(), [...EXPECTED_TYPES].sort());
    });
});
