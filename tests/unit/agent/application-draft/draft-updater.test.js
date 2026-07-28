'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const updater = require('../../../../src/modules/agent/application-draft/draft-updater');

const makeAgent = () => ({});

test('draft-updater field mapping', async (t) => {
    const supportedFields = [
        ['district', 'Kathmandu'],
        ['municipality', 'KMC'],
        ['placeName', 'Thamel'],
        ['businessName', 'My Bus Co'],
        ['shopAddress', 'Main Road 1'],
        ['operationType', 'RETAIL'],
        ['claimedMonthlyVolume', 500],
        ['currentOperators', 3],
        ['referralSource', 'social'],
        ['citizenshipNumber', 'CIT-001'],
        ['nationalIdNumber', 'NID-001'],
        ['panNumber', 'PAN-001'],
        ['settlementMethod', 'bank'],
        ['bankName', 'Test Bank'],
        ['bankAccountNumber', '123456789'],
        ['bankAccountName', 'Test Account'],
        ['esewaNumber', '98100000001'],
        ['khaltiNumber', '98100000002'],
    ];

    for (const [field, value] of supportedFields) {
        await t.test(`sets ${field} when provided`, () => {
            const agent = makeAgent();
            updater.updateDraftFields(agent, { [field]: value });
            assert.equal(agent[field], value);
        });
    }

    await t.test('sets whatsappConsent using !!whatsappConsent for truthy string', () => {
        const agent = makeAgent();
        updater.updateDraftFields(agent, { whatsappConsent: 'true' });
        assert.equal(agent.whatsappConsent, true);
    });

    await t.test('sets whatsappConsent using !!whatsappConsent for falsy string', () => {
        const agent = makeAgent();
        updater.updateDraftFields(agent, { whatsappConsent: '' });
        assert.equal(agent.whatsappConsent, false);
    });

    await t.test('sets whatsappConsent using !!whatsappConsent for boolean true', () => {
        const agent = makeAgent();
        updater.updateDraftFields(agent, { whatsappConsent: true });
        assert.equal(agent.whatsappConsent, true);
    });

    await t.test('sets whatsappConsent using !!whatsappConsent for boolean false', () => {
        const agent = makeAgent();
        updater.updateDraftFields(agent, { whatsappConsent: false });
        assert.equal(agent.whatsappConsent, false);
    });

    await t.test('omitted fields remain unchanged on agent', () => {
        const agent = { district: 'Pokhara', municipality: 'Existing' };
        updater.updateDraftFields(agent, { district: 'Ktm' });
        assert.equal(agent.district, 'Ktm');
        assert.equal(agent.municipality, 'Existing');
    });

    await t.test('explicit null is saved for a field', () => {
        const agent = { municipality: 'Old' };
        updater.updateDraftFields(agent, { municipality: null });
        assert.equal(agent.municipality, null);
    });

    await t.test('unknown fields in payload are not written to agent', () => {
        const agent = makeAgent();
        updater.updateDraftFields(agent, { unknownField: 'ignored-value', district: 'Ktm' });
        assert.equal(agent.district, 'Ktm');
        assert.equal(agent.unknownField, undefined);
    });
});
