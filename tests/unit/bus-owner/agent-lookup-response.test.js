'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const mapper = require('../../../src/modules/bus-owner/agent-lookup/bus-owner-agent-lookup.mapper');

const VALID_CODE = 'SM-AG-MAVSKNF';

/**
 * A full Agent row as it would be if nothing were projected away — including the
 * fields the repository projection is there to exclude. The mapper is handed the
 * lot on purpose: if it ever starts spreading its input, these assertions fail.
 */
const fullAgent = (over = {}) => ({
  _id: '507f1f77bcf86cd799439011',
  code: VALID_CODE,
  agentId: 'SHV-AG-KTM-001',
  scope: 'OPERATOR',
  applicationStatus: 'VERIFIED_BASIC',
  outletType: 'TRAVEL_AGENCY',
  businessName: 'Himalaya Travels',
  district: 'Kathmandu',
  municipality: 'Kathmandu Metropolitan City',
  placeName: 'Thamel, Ward 26',
  shopAddress: 'Chaksibari Marg 14',
  citizenshipNumber: '12-34-56-78901',
  panNumber: '301234567',
  bankAccountNumber: '0123456789012',
  bankName: 'Nabil Bank',
  adminNotes: 'called twice, no answer',
  commissionBalance: 4200,
  linkedOperatorId: '507f1f77bcf86cd799439022',
  user: {
    _id: '507f1f77bcf86cd799439033',
    name: 'Ram Bahadur',
    phone: '9800000000',
    email: 'ram@example.com',
    phoneVerified: true,
  },
  ...over,
});

const preview = (over = {}) => mapper.toPreviewResponse({
  agent: fullAgent(over),
  kycStatus: 'VERIFIED_BASIC',
  isVerified: true,
}).data;

test('agent preview — what it shows', async (t) => {
  await t.test('is exactly the agreed key set', () => {
    assert.deepEqual(Object.keys(preview()).sort(), [
      'agentCode', 'businessName', 'canBeAssigned', 'district',
      'isVerified', 'kycStatus', 'municipality', 'name', 'outletType',
    ]);
  });

  await t.test('carries the code, the name and the shopfront', () => {
    const data = preview();
    assert.equal(data.agentCode, VALID_CODE);
    assert.equal(data.name, 'Ram Bahadur');
    assert.equal(data.businessName, 'Himalaya Travels');
    assert.equal(data.outletType, 'TRAVEL_AGENCY');
  });

  await t.test('locates the agent by district and municipality only', () => {
    const data = preview();
    assert.equal(data.district, 'Kathmandu');
    assert.equal(data.municipality, 'Kathmandu Metropolitan City');
  });

  await t.test('translates a legacy operationType into an outlet type', () => {
    const data = preview({ outletType: null, operationType: 'travel_agent' });
    assert.equal(data.outletType, 'TRAVEL_AGENCY');
  });

  await t.test('nulls missing optional fields rather than omitting them', () => {
    const data = preview({ businessName: null, district: null, municipality: null, user: null });
    assert.equal(data.name, null);
    assert.equal(data.businessName, null);
    assert.equal(data.district, null);
    assert.equal(data.municipality, null);
  });
});

test('agent preview — what it must never show', async (t) => {
  const serialised = () => JSON.stringify(preview());

  await t.test('leaks no contact details', () => {
    // A lookup keyed on a published code must not be a way to resolve that code
    // into a phone number or an email address.
    assert.doesNotMatch(serialised(), /9800000000/);
    assert.doesNotMatch(serialised(), /ram@example\.com/);
    assert.equal('phone' in preview(), false);
    assert.equal('email' in preview(), false);
  });

  await t.test('leaks no identity or financial documents', () => {
    for (const secret of ['12-34-56-78901', '301234567', '0123456789012', 'Nabil Bank']) {
      assert.doesNotMatch(serialised(), new RegExp(secret), `${secret} must not appear`);
    }
  });

  await t.test('leaks no internal ids', () => {
    // The assign API takes the code. An _id handed out on a read is an _id that
    // starts turning up in requests that never expected it.
    assert.doesNotMatch(serialised(), /507f1f77bcf86cd7994390/);
    assert.equal('agentId' in preview(), false, 'the Mongo _id must not be exposed');
  });

  await t.test('leaks no other operator relationships', () => {
    // Which operators an agent already works for is a competitor relationship.
    assert.doesNotMatch(serialised(), /507f1f77bcf86cd799439022/);
    assert.equal('linkedOperatorId' in preview(), false);
    assert.equal('operators' in preview(), false);
  });

  await t.test('leaks no street address', () => {
    assert.doesNotMatch(serialised(), /Thamel/);
    assert.doesNotMatch(serialised(), /Chaksibari/);
  });

  await t.test('leaks no admin notes, balances or verification internals', () => {
    assert.doesNotMatch(serialised(), /called twice/);
    assert.doesNotMatch(serialised(), /4200/);
    assert.equal('phoneVerified' in preview(), false);
    assert.equal('scope' in preview(), false);
  });

  await t.test('promises no photo, since no photo field exists', () => {
    // The master plan lists one in the preview, but neither Agent nor User has a
    // photo, avatar or image field. A null under a `photo` key would promise the
    // client something the schema cannot deliver.
    assert.equal('photo' in preview(), false);
  });
});

test('agent preview — assignability', async (t) => {
  await t.test('is true, because an unassignable agent never reaches the mapper', () => {
    assert.equal(preview().canBeAssigned, true);
  });

  await t.test('reflects the status and badge it was handed', () => {
    const data = mapper.toPreviewResponse({
      agent: fullAgent(), kycStatus: 'DRAFT', isVerified: false,
    }).data;
    assert.equal(data.kycStatus, 'DRAFT');
    assert.equal(data.isVerified, false);
  });
});
