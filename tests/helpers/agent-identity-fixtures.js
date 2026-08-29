'use strict';

/**
 * A fully-populated agent and user, as the identity repository's projections
 * return them. Shared by the mapper suites so they cannot disagree about what a
 * complete record looks like.
 */

/** An OPERATOR agent with everything on file: cleared, coded, operator-created. */
const agent = (overrides = {}) => ({
  code: 'SM-AG-7K4QP2X',
  agentId: 'SHV-AG-KTM-001',
  scope: 'OPERATOR',
  outletType: 'TICKET_COUNTER',
  applicationStatus: 'VERIFIED_BASIC',
  district: 'Kaski',
  municipality: 'Pokhara',
  placeName: 'Lakeside',
  businessName: 'Lake View Travels',
  shopAddress: 'Baidam Road 12',
  createdByOwnerId: '507f1f77bcf86cd799439011',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  ...overrides,
});

const user = (overrides = {}) => ({
  name: 'Ram Bahadur',
  phone: '9800000000',
  profilePicture: 'https://cdn.example/x.jpg',
  // Part of USER_IDENTITY_FIELDS: the OPERATOR KYC status is derived from it.
  phoneVerified: true,
  ...overrides,
});

/**
 * The same agent as a stand-in for the Mongoose document the repository returns.
 *
 * The service writes through `set()` and lets the repository decide when to save,
 * so that is all a fake needs. `set()` really mutates, so a test can read the
 * field back and see what would have been persisted.
 */
const agentDoc = (overrides = {}) => {
  const doc = agent(overrides);
  doc.set = (field, value) => { doc[field] = value; return doc; };
  return doc;
};

module.exports = { agent, agentDoc, user };
