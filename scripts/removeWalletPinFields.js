'use strict';
require('dotenv').config();
const mongoose = require('mongoose');
const Wallet = require('../models/walletModel');

async function removeWalletPinFields() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  await mongoose.connect(process.env.MONGODB_URI);
  try {
    const result = await Wallet.collection.updateMany({
      $or: [{ pin: { $exists: true } }, { isPinSet: { $exists: true } }],
    }, { $unset: { pin: '', isPinSet: '' } });
    console.log(JSON.stringify({ matched: result.matchedCount, modified: result.modifiedCount }));
  } finally { await mongoose.disconnect(); }
}
if (require.main === module) removeWalletPinFields().catch(error => {
  console.error(error.message); process.exitCode = 1;
});
module.exports = { removeWalletPinFields };
