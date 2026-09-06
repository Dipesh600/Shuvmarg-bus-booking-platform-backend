"use strict";
const mongoose = require("mongoose");
const schema = new mongoose.Schema({
  scope: { type: String, required: true },
  operationId: { type: String, required: true },
  fingerprint: { type: String, required: true },
  actorId: { type: String, required: true },
  payload: { type: mongoose.Schema.Types.Mixed, required: true },
  result: { type: mongoose.Schema.Types.Mixed, default: null },
}, { timestamps: true });
schema.index({ scope: 1, operationId: 1 }, { unique: true, name: "one_financial_operation" });
module.exports = mongoose.model("FinancialOperation", schema);
