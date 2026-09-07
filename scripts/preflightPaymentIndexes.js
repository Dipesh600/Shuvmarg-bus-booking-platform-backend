'use strict';
const mongoose = require('mongoose');
const { isDeepStrictEqual } = require('node:util');
async function inspectPaymentIndexes(db, models) {
  const report = { checked: 0, missing: [], ready: true };
  for (const model of models) {
    let indexes;
    try { indexes = await db.collection(model.collection.name).listIndexes().toArray(); }
    catch (error) { if (error.codeName !== 'NamespaceNotFound') throw error; indexes = []; }
    for (const [key, options] of model.schema.indexes().filter(([, options]) => options.unique)) {
      report.checked++;
      const found = indexes.some(index => isDeepStrictEqual(index.key, key) && index.unique === true
        && Boolean(index.sparse) === Boolean(options.sparse)
        && isDeepStrictEqual(index.partialFilterExpression, options.partialFilterExpression));
      if (!found) report.missing.push({ collection: model.collection.name, key, name: options.name || null });
    }
  }
  report.ready = report.missing.length === 0;
  return report;
}
async function run() {
  require('dotenv').config();
  mongoose.set('autoIndex', false); mongoose.set('autoCreate', false);
  try {
    if (!process.env.MONGODB_URL) throw new Error('Database configuration missing');
    const names = ['smLedger', 'bookTicket', 'refund', 'financialOperation', 'refundSettlement', 'esewaPaymentAttempt', 'seatHold', 'settlementTripClaim', 'coupon'];
    const models = names.map(name => require(`../models/${name}Model`));
    await mongoose.connect(process.env.MONGODB_URL, { autoIndex: false, autoCreate: false });
    const report = await inspectPaymentIndexes(mongoose.connection.db, models);
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.ready ? 0 : 2;
  } catch { console.error('Payment index preflight failed. Check read-only database access.'); process.exitCode = 1; }
  finally { await mongoose.disconnect(); }
}
module.exports = { inspectPaymentIndexes };
if (require.main === module) run();
