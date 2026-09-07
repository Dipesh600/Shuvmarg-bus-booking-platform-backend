'use strict';
const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  tripId: { type: mongoose.Schema.Types.ObjectId, required: true, unique: true },
  settlementId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'Settlement' },
}, { timestamps: true });
module.exports = mongoose.model('SettlementTripClaim', schema);
