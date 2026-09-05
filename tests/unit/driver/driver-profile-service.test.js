'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createDriverProfileService } = require('../../../src/modules/driver/profile/driver-profile.service');

const driver = (id = 'driver-1') => ({
  _id: id,
  fullName: 'Driver Name',
  phone: '9800000000',
  experienceYears: 2,
  status: 'AVAILABLE',
  accessStatus: 'ACTIVE',
  licenseNumber: 'LIC-1',
  licenseType: 'HV',
  licenseExpiry: new Date('2029-01-01T00:00:00.000Z'),
  brandId: null,
});

const serviceWith = (profiles) => createDriverProfileService({
  profileRepository: {
    async findLiveByUserId(userId) {
      assert.equal(userId, 'user-1');
      return profiles;
    },
  },
});

test('returns the one live Driver profile linked to the signed-in User id', async () => {
  const result = await serviceWith([driver()]).getProfile('user-1');
  assert.equal(result.statusCode, 200);
  assert.equal(result.responseBody.data.fullName, 'Driver Name');
});

test('does not fabricate a Driver identity when no live profile exists', async () => {
  await assert.rejects(
    serviceWith([]).getProfile('user-1'),
    (error) => error.statusCode === 404
      && error.responseBody.errorCode === 'DRIVER_PROFILE_NOT_FOUND',
  );
});

test('fails closed when corrupt data links more than one live profile', async () => {
  await assert.rejects(
    serviceWith([driver('driver-1'), driver('driver-2')]).getProfile('user-1'),
    (error) => error.statusCode === 409
      && error.responseBody.errorCode === 'DRIVER_PROFILE_CONFLICT',
  );
});
