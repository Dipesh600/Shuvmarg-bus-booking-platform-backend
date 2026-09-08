"use strict";
const mongoose = require("mongoose");
const schema = new mongoose.Schema({
  method: { type: String, required: true },
  reference: { type: String, required: true },
  caseId: { type: String, required: true },
  amountMinor: { type: Number, required: true, min: 1 },
  evidence: { type: mongoose.Schema.Types.Mixed, required: true },
}, { timestamps: true });
schema.index({ method: 1, reference: 1 }, { unique: true, name: "one_refund_settlement_reference" });
module.exports = mongoose.model("RefundSettlement", schema);
