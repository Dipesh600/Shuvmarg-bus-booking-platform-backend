'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const mapper = require('../../../src/modules/driver/profile/driver-profile.mapper');

const profile = (overrides = {}) => ({
  _id: '6a9a8e2adcbb5a8ebdb42d7b',
  userId: '6a68674ea1a573eedf253a66',
  ownerId: '69fa49261500599a44ac34ac',
  fullName: 'dipesh chaudhary',
  phone: '9863053420',
  email: null,
  gender: 'male',
  experienceYears: 4,
  brandId: {
    _id: '6a7f7f8965c69e4a7c82ee7e',
    brandName: 'Dai Bhai Travels',
    brandCode: 'DBT',
  },
  status: 'AVAILABLE',
  accessStatus: 'ACTIVE',
  approvalStatus: 'APPROVED',
  licenseNumber: '34554677887987',
  licenseType: 'HV',
  licenseExpiry: new Date('2029-07-20T00:00:00.000Z'),
  licenseDoc: 'private/drivers/license.webp',
  documents: {
    license: { url: 'private/drivers/license.webp' },
    medical: { url: null, validTill: null },
  },
  approvedBy: 'admin-secret-id',
  notes: 'internal only',
  ...overrides,
});

test('driver profile identity comes from DriverProfile, not the shared User', () => {
  const data = mapper.toDriverProfile(profile());
  assert.equal(data.fullName, 'dipesh chaudhary');
  assert.equal(data.phone, '9863053420');
  assert.equal(data.gender, 'male');
  assert.equal(data.experienceYears, 4);
  assert.deepEqual(data.brand, {
    id: '6a7f7f8965c69e4a7c82ee7e',
    name: 'Dai Bhai Travels',
    code: 'DBT',
  });
});

test('driver response is narrow and never exposes storage or review internals', () => {
  const response = mapper.toResponse(profile());
  assert.equal(response.success, true);
  assert.equal(response.data.license.documentUploaded, true);
  assert.equal(response.data.medicalCertificate.documentUploaded, false);

  const serialized = JSON.stringify(response);
  for (const secret of [
    'private/drivers/license.webp',
    'admin-secret-id',
    'internal only',
    'ownerId',
    'userId',
    'approvedBy',
    'approvalStatus',
  ]) {
    assert.equal(serialized.includes(secret), false, `leaked: ${secret}`);
  }
});
