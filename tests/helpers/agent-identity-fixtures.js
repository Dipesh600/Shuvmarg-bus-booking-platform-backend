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
  ...overrides,
});

module.exports = { agent, user };
