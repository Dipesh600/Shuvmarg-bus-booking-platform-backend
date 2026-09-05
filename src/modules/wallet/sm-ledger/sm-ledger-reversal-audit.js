"use strict";

// Read-only and streaming: reports evidence, never calculates or applies corrections.
async function* auditDebitReversals(SMLedger) {
  const cursor = SMLedger.find({ type: "DEBIT_REVERSAL" }).lean().cursor();
  try {
    for await (const reversal of cursor) {
      const reasons = [];
      const debit = reversal.relatedLedgerEntryId
        ? await SMLedger.findById(reversal.relatedLedgerEntryId).lean() : null;
      if (!debit || debit.type !== "DEBIT" || debit.direction !== "DEBIT") {
        reasons.push("MISSING_OR_INVALID_ORIGINAL_DEBIT");
      } else {
        if (String(debit.userId) !== String(reversal.userId)) reasons.push("USER_MISMATCH");
        if (debit.amount !== reversal.amount) reasons.push("AMOUNT_MISMATCH");
        const siblings = await SMLedger.find({ type: "DEBIT_REVERSAL",
          relatedLedgerEntryId: debit._id }).select("_id").limit(2).lean();
        if (siblings.length > 1) reasons.push("DUPLICATE_COMPENSATION");
        if (!debit.reversalEntryId || debit.note?.includes("[REVERSED]")) {
          reasons.push("LEGACY_RESTORATION_REVIEW_REQUIRED");
        }
        if (debit.reversalEntryId && String(debit.reversalEntryId) !== String(reversal._id)) {
          reasons.push("REVERSAL_MARKER_MISMATCH");
        }
      }
      if (reversal.direction !== "CREDIT") reasons.push("INVALID_COMPENSATION_DIRECTION");
      if (!Number.isFinite(reversal.amount) || reversal.amount <= 0) reasons.push("INVALID_AMOUNT");
      yield { entryId: String(reversal._id), debitId: debit ? String(debit._id) : null,
        amount: reversal.amount, reasons };
    }
  } finally { await cursor.close(); }

  const marked = SMLedger.find({ type: "DEBIT", $or: [
    { reversalEntryId: { $ne: null } }, { note: /\[REVERSED\]/ },
  ] }).lean().cursor();
  try {
    for await (const debit of marked) {
      const linked = await SMLedger.exists({ type: "DEBIT_REVERSAL", relatedLedgerEntryId: debit._id });
      if (!linked) yield { entryId: String(debit._id), debitId: String(debit._id),
        amount: debit.amount, reasons: ["MARKER_WITHOUT_COMPENSATION"] };
    }
  } finally { await marked.close(); }
}

module.exports = { auditDebitReversals };
