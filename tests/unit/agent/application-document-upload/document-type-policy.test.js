'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const docTypePolicy = require('../../../../src/modules/agent/application-document-upload/document-type.policy');

const VALID = [
    'citizenship_front',
    'citizenship_back',
    'national_id_front',
    'national_id_back',
    'shop_photo',
    'pan_card',
    'business_registration',
];

test('document-type policy', async (t) => {
    for (const type of VALID) {
        await t.test(`isValidDocumentType returns true for ${type}`, () => {
            assert.equal(docTypePolicy.isValidDocumentType(type), true);
        });
    }

    await t.test('isValidDocumentType returns false for unknown type', () => {
        assert.equal(docTypePolicy.isValidDocumentType('drivers_license'), false);
    });

    await t.test('isValidDocumentType returns false for empty string', () => {
        assert.equal(docTypePolicy.isValidDocumentType(''), false);
    });

    await t.test('isValidDocumentType returns false for undefined', () => {
        assert.equal(docTypePolicy.isValidDocumentType(undefined), false);
    });

    await t.test('VALID_DOCUMENT_TYPES has exactly 7 entries', () => {
        assert.equal(docTypePolicy.VALID_DOCUMENT_TYPES.length, 7);
    });
});
