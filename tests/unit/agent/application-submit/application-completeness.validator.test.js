'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validateCompleteness } = require('../../../../src/modules/agent/application-submit/application-completeness.validator');

test('application-completeness.validator', async (t) => {
  await t.test('passes when all required fields and documents are present', () => {
    const agent = {
      district: 'Kathmandu',
      municipality: 'KMC',
      placeName: 'Thamel',
      operationType: 'individual',
      shopAddress: 'Thamel-29',
      citizenshipNumber: '123-456',
      panNumber: '987654',
      documents: [
        { type: 'citizenship_front' },
        { type: 'citizenship_back' },
        { type: 'pan_card' }
      ]
    };
    const result = validateCompleteness(agent);
    assert.equal(result.isValid, true);
  });

  await t.test('requires businessName if not individual', () => {
    const agent = {
      district: 'Kathmandu',
      municipality: 'KMC',
      placeName: 'Thamel',
      operationType: 'company',
      shopAddress: 'Thamel-29',
      citizenshipNumber: '123-456',
      panNumber: '987654',
      documents: [
        { type: 'citizenship_front' },
        { type: 'citizenship_back' },
        { type: 'pan_card' }
      ]
    };
    const result = validateCompleteness(agent);
    assert.equal(result.isValid, false);
    assert.equal(result.errors.length, 1);
    assert.equal(result.errors[0], 'Business name is required for your agent type.');

    agent.businessName = 'My Business';
    assert.equal(validateCompleteness(agent).isValid, true);
  });

  await t.test('returns multiple errors for missing fields', () => {
    const agent = {
      documents: []
    };
    const result = validateCompleteness(agent);
    assert.equal(result.isValid, false);
    assert.equal(result.errors.includes('District is required.'), true);
    assert.equal(result.errors.includes('Citizenship number is required.'), true);
    assert.equal(result.errors.includes('citizenship front document is required.'), true);
  });
});
