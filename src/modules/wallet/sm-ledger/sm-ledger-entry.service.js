"use strict";

function createSmLedgerEntryService({ SMLedger, PlatformConfig, now = () => new Date() }) {
  async function creditLedger({
    userId,
    type,
    amount,
    bookingId = null,
    referralId = null,
    relatedLedgerEntryId = null,
    status = "ACTIVE",
    expiresInMonths = null,
    bookingNumber = null,
    note = null,
    session = null,
  }) {
    if (amount <= 0) throw new Error("Credit amount must be greater than zero");
    let expiryMonths = expiresInMonths;
    if (expiryMonths === null) {
      const config = await PlatformConfig.getConfig("sm_money_config");
      expiryMonths = config.creditExpiryMonths || 12;
    }
    const expiresAt = now();
    expiresAt.setMonth(expiresAt.getMonth() + expiryMonths);
    const entries = await SMLedger.create(
      [
        {
          userId,
          bookingId,
          referralId,
          relatedLedgerEntryId,
          type,
          direction: "CREDIT",
          amount,
          status,
          bookingNumber,
          expires_at: status === "LOCKED" ? null : expiresAt,
          remainingAmount: status === "ACTIVE" ? amount : 0,
          note,
        },
      ],
      session ? { session } : {}
    );
    return entries[0];
  }

  async function debitLedgerSimple({
    userId,
    type,
    amount,
    bookingId = null,
    referralId = null,
    relatedLedgerEntryId = null,
    note = null,
    session = null,
  }) {
    if (amount <= 0) throw new Error("Debit amount must be greater than zero");
    const entries = await SMLedger.create(
      [
        {
          userId,
          bookingId,
          referralId,
          relatedLedgerEntryId,
          type,
          direction: "DEBIT",
          amount,
          status: "PROCESSED",
          expires_at: null,
          remainingAmount: null,
          note,
        },
      ],
      session ? { session } : {}
    );
    return entries[0];
  }

  return { creditLedger, debitLedgerSimple };
}

module.exports = { createSmLedgerEntryService };
