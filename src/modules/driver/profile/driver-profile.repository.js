'use strict';

const DriverProfile = require('../../../../models/driverProfileModel');

const DRIVER_PROFILE_FIELDS = [
  'userId brandId fullName phone email gender experienceYears',
  'licenseNumber licenseType licenseExpiry licenseDoc',
  'medicalCertExpiry medicalCertDoc documents',
  'status accessStatus removedAt',
].join(' ');

/**
 * Return every live row instead of findOne. Silently choosing one of two linked
 * profiles would cross operator boundaries; the service fails closed instead.
 */
const findLiveByUserId = (userId) => DriverProfile.find({
  userId,
  removedAt: null,
})
  .select(DRIVER_PROFILE_FIELDS)
  .populate({ path: 'brandId', select: 'brandName brandCode' })
  .lean();

module.exports = { DRIVER_PROFILE_FIELDS, findLiveByUserId };
