'use strict';
const mongoose = require('mongoose');
const Settlement = require('../../models/settlementModel');
const Claim = require('../../models/settlementTripClaimModel');
const { withMongoTransaction } = require('./with-mongo-transaction');
async function createOwnerSettlement(payload) {
  try {
    return await withMongoTransaction(mongoose, null, async session => {
      // Preserve historical reservations, including received or disputed payouts.
      if (await Settlement.exists({ tripIds: { $in: payload.tripIds } }).session(session)) {
        throw Object.assign(new Error('A trip already has a settlement'), { statusCode: 409 });
      }
      const id = new mongoose.Types.ObjectId();
      await Claim.create(payload.tripIds.map(tripId => ({ tripId, settlementId: id })), { session });
      const [settlement] = await Settlement.create([{ ...payload, _id: id }], { session });
      return settlement;
    });
  } catch (error) {
    if (error.code === 11000) throw Object.assign(new Error('A trip already has a settlement'), { statusCode: 409 });
    throw error;
  }
}
module.exports = { createOwnerSettlement };
