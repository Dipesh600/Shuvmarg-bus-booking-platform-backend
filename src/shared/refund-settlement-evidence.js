"use strict";
const Settlement = require("../../models/refundSettlementModel");
const { toMinorUnits } = require("./money");
const fail = message => Object.assign(new Error(message), { statusCode: 409 });

async function recordManualSettlement({ caseId, amount, evidence, adminId, session }) {
  if (!evidence?.proofKey || !evidence.reference || !evidence.submittedBy) {
    throw fail("Save the payout proof and reference for independent finance review before completing this refund");
  }
  if (String(evidence.submittedBy) === String(adminId)) {
    throw fail("A different finance administrator must verify the recorded payout proof");
  }
  const amountMinor = toMinorUnits(amount, { allowZero: false });
  if (evidence.amountMinor !== amountMinor) throw fail("Settlement evidence amount does not match the refund");
  await Settlement.create([{ method: evidence.method, reference: evidence.reference,
    caseId, amountMinor, evidence: { ...evidence, verifiedBy: String(adminId), verifiedAt: new Date() } }], { session });
  return { ...evidence, verifiedBy: String(adminId), verifiedAt: new Date() };
}

module.exports = { recordManualSettlement, fail };
