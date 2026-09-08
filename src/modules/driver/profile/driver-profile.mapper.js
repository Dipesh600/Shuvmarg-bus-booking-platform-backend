'use strict';

const idOf = (value) => {
  if (!value) return null;
  return String(value._id || value);
};

const dateOf = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const hasDocument = (...values) => values.some((value) => (
  typeof value === 'string' && value.trim().length > 0
));

/**
 * DriverProfile is the source of truth for the driver persona. User is only the
 * shared login identity and may carry a different name for another role.
 *
 * This mapper intentionally exposes document presence, never an object key or
 * URL. Driver compliance documents are private and must remain behind an
 * authenticated document proxy when a driver-facing viewer is introduced.
 */
const toDriverProfile = (profile) => {
  const brand = profile.brandId && typeof profile.brandId === 'object'
    ? profile.brandId
    : null;

  return {
    driverId: idOf(profile._id),
    fullName: profile.fullName,
    phone: profile.phone,
    email: profile.email || null,
    gender: profile.gender || null,
    experienceYears: Number(profile.experienceYears || 0),
    brand: brand ? {
      id: idOf(brand),
      name: brand.brandName || null,
      code: brand.brandCode || null,
    } : null,
    operationalStatus: profile.status,
    accessStatus: profile.accessStatus,
    license: {
      number: profile.licenseNumber,
      type: profile.licenseType,
      expiry: dateOf(profile.licenseExpiry),
      documentUploaded: hasDocument(
        profile.licenseDoc,
        profile.documents?.license?.url,
      ),
    },
    medicalCertificate: {
      expiry: dateOf(
        profile.medicalCertExpiry || profile.documents?.medical?.validTill,
      ),
      documentUploaded: hasDocument(
        profile.medicalCertDoc,
        profile.documents?.medical?.url,
      ),
    },
  };
};

const toResponse = (profile) => ({
  success: true,
  message: 'Driver profile retrieved.',
  data: toDriverProfile(profile),
});

module.exports = { toDriverProfile, toResponse };
