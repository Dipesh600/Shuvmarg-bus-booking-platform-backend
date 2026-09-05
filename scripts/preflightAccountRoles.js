'use strict';

const mongoose = require('mongoose');
const { ACCOUNT_ROLES } = require('../src/shared/auth/account-role.policy');
const ALLOWED_ROLES = new Set(ACCOUNT_ROLES);

// Use the raw collection: Mongoose defaults must not hide missing legacy fields.
async function inspectAccountRoles(collection, sampleLimit = 25) {
  const report = { scanned: 0, missingLegacyRoles: 0, emptyRoles: 0, malformedRoles: 0,
    historicalRoleNotGranted: 0, samples: [] };
  const cursor = collection.find({}, { projection: { _id: 1, role: 1, roles: 1 } });
  for await (const user of cursor) {
    report.scanned += 1;
    let issue;
    if (user.roles === undefined && ALLOWED_ROLES.has(user.role)) issue = 'missingLegacyRoles';
    else if (!Array.isArray(user.roles) || user.roles.some(role => !ALLOWED_ROLES.has(role))) issue = 'malformedRoles';
    else if (user.roles.length === 0) issue = 'emptyRoles';
    else if (!user.roles.includes(user.role)) report.historicalRoleNotGranted += 1;
    if (issue) {
      report[issue] += 1;
      if (report.samples.length < sampleLimit) report.samples.push({ userId: String(user._id), issue });
    }
  }
  report.requiresReview = report.emptyRoles > 0 || report.malformedRoles > 0;
  return report;
}

async function run() {
  require('dotenv').config();
  try {
    if (!process.env.MONGODB_URL) throw new Error('MONGODB_URL is required');
    await mongoose.connect(process.env.MONGODB_URL, { autoIndex: false, autoCreate: false });
    const report = await inspectAccountRoles(mongoose.connection.collection('users'));
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.requiresReview ? 2 : 0;
  } catch {
    console.error('Account role preflight failed. Check database configuration and connectivity.');
    process.exitCode = 1;
  } finally { await mongoose.disconnect(); }
}

module.exports = { inspectAccountRoles };
if (require.main === module) run();
