'use strict';

const PartnerLead = require('../../../../../models/PartnerLead');

const upsertOtpVerifiedLead = (phone) => PartnerLead.findOneAndUpdate(
  {
    phone,
    leadType: 'otp_verified',
    entityType: 'agent',
  },
  {
    phone,
    leadType: 'otp_verified',
    entityType: 'agent',
    phoneVerified: true,
    source: 'agent_app',
    $setOnInsert: {
      status: 'new',
    },
  },
  {
    upsert: true,
    new: true,
    setDefaultsOnInsert: true,
  },
);

const convertOtpVerifiedLead = (phone, fullName) => PartnerLead.updateMany(
  {
    phone,
    leadType: 'otp_verified',
    entityType: 'agent',
  },
  {
    $set: {
      status: 'converted',
      fullName,
    },
  },
);

module.exports = {
  upsertOtpVerifiedLead,
  convertOtpVerifiedLead,
};
