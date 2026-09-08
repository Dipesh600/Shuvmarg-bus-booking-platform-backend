"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createPassengerInternalMoneyCompensationService } = require("../../../src/modules/booking/passenger-internal-money-compensation/passenger-internal-money-compensation.service");
const { createPassengerSplitPaymentService } = require("../../../src/modules/booking/passenger-split-payment/passenger-split-payment.service");

test("failed split reversal retains its debit reference and can succeed on retry", async () => {
  let attempts = 0;
  const smLedgerService = {
    debitLedgerFIFO: async () => {},
    reverseDebit: async id => {
      assert.equal(id, "split-debit");
      if (++attempts === 1) throw new Error("database unavailable");
      return { _id: "compensation" };
    },
  };
  const splitPayment = createPassengerSplitPaymentService({ smLedgerService,
    mapper: { mapSplitPaymentDebitFailure: () => ({ ok: false }) } });
  const service = createPassengerInternalMoneyCompensationService({ smLedgerService, splitPayment });
  const first = await service.reversePassengerInternalMoneyDebits({ splitPaymentDebitEntryId: "split-debit" });
  assert.equal(first.splitPaymentDebitEntryId, "split-debit");
  const second = await service.reversePassengerInternalMoneyDebits(first);
  assert.equal(second.splitPaymentDebitEntryId, null);
  assert.equal(attempts, 2);
});

test("ambiguous split result is retained while an independent wallet reversal completes", async () => {
  const calls = [];
  const service = createPassengerInternalMoneyCompensationService({
    smLedgerService: { reverseDebit: async id => calls.push(id) },
    splitPayment: { reversePassengerSplitPaymentDebit: async () => undefined },
  });
  const result = await service.reversePassengerInternalMoneyDebits({
    splitPaymentDebitEntryId: "split-debit", walletDebitEntryId: "wallet-debit",
  });
  assert.equal(result.splitPaymentDebitEntryId, "split-debit");
  assert.equal(result.walletDebitEntryId, null);
  assert.deepEqual(calls, ["wallet-debit"]);
});
