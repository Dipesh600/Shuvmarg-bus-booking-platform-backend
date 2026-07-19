'use strict';

const PartnerLead = require('../../../../../models/PartnerLead');

const upsertOtpVerifiedLead = (phone) => PartnerLead.findOneAndUpdate(
  {
    phone,
    leadType: 'otp_verified',
    entityType: 'busOwner',
  },
  {
    phone,
    leadType: 'otp_verified',
    entityType: 'busOwner',
    phoneVerified: true,
    source: 'busowner_app',
    $setOnInsert: { status: 'new' },
  },
  {
    upsert: true,
    new: true,
    setDefaultsOnInsert: true,
  },
);

const convertOtpVerifiedLead = (phone) => PartnerLead.updateMany(
  {
    phone,
    leadType: 'otp_verified',
    entityType: 'busOwner',
  },
  {
    $set: { status: 'converted' },
  },
);

module.exports = {
  upsertOtpVerifiedLead,
  convertOtpVerifiedLead,
};
