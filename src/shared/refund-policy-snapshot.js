"use strict";
const RefundPolicy = require("../../models/refundPolicyModel");

async function captureRefundPolicySnapshot() {
  const policies = await RefundPolicy.find({ isActive: true }).sort({ minHours: 1, _id: 1 }).lean();
  return { version: 1, capturedAt: new Date(), rules: policies.map(p => ({
    _id: String(p._id), policyName: p.policyName, description: p.description,
    minHours: p.minHours, maxHours: p.maxHours, refundPercentage: p.refundPercentage,
  })) };
}

module.exports = { captureRefundPolicySnapshot };
