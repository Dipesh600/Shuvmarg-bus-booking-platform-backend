'use strict';
const mongoose = require('mongoose');
const Settlement = require('../../../../models/settlementModel');
const { withMongoTransaction } = require('../../../shared/with-mongo-transaction');
const { recordManualSettlement, fail } = require('../../../shared/refund-settlement-evidence');
const { toMinorUnits } = require('../../../shared/money');
async function reviewOwnerSettlement({ settlementId, adminId, action, paymentReference, proofKey, remarks }) {
  if (!mongoose.isValidObjectId(settlementId) || !mongoose.isValidObjectId(adminId)) throw fail('Valid settlement and administrator IDs are required');
  if (!['submit-proof', 'confirm-paid'].includes(action)) throw fail('Submit payout proof before a separate finance reviewer confirms payment');
  return withMongoTransaction(mongoose, null, async session => {
    const settlement = await Settlement.findById(settlementId).session(session);
    if (!settlement) throw Object.assign(new Error('Settlement not found'), { statusCode: 404 });
    if (['paid', 'received'].includes(settlement.status) && action === 'confirm-paid') return settlement;
    if (!['pending', 'processing'].includes(settlement.status)) throw fail('Settlement cannot be changed in this state');
    const amountMinor = toMinorUnits(settlement.netPayableAmount, { allowZero: false });
    if (action === 'submit-proof') {
      if (!proofKey || typeof paymentReference !== 'string' || !paymentReference.trim() || paymentReference.length > 200) throw fail('A bank payout receipt and reference are required');
      if (settlement.settlementEvidence) throw fail('Proof is already submitted; review the recorded payout');
      settlement.settlementEvidence = { kind: 'manual', method: 'bank_transfer', reference: paymentReference.trim(),
        proofKey, submittedBy: String(adminId), submittedAt: new Date(), amountMinor };
      settlement.status = 'processing'; settlement.paymentMethod = 'BANK_TRANSFER'; settlement.paymentProof = proofKey;
    } else {
      settlement.settlementEvidence = await recordManualSettlement({ caseId: `owner:${settlement._id}`,
        amount: settlement.netPayableAmount, evidence: settlement.settlementEvidence, adminId, session });
      settlement.status = 'paid'; settlement.paidAt = new Date(); settlement.paidBy = adminId;
    }
    if (remarks !== undefined) {
      if (typeof remarks !== 'string' || remarks.length > 2000) throw fail('Invalid remarks');
      settlement.remarks = remarks.trim();
    }
    await settlement.save({ session });
    return settlement;
  });
}
module.exports = { reviewOwnerSettlement };
