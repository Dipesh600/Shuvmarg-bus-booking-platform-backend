const { test, mock } = require("node:test");
const assert = require("node:assert");
const smLedger = require("../../../services/smLedgerService");
const walletService = require("../../../services/walletService");

const { createPassengerBookingCancellationRefundService } = require("../../../src/modules/booking/passenger-booking-cancellation/passenger-booking-cancellation-refund.service.js");

test("processRefundAndClawback - original method", async (t) => {
  mock.method(smLedger, "clawbackCashback", async () => ({ clawedBack: 10 }));
  
  const repository = {
    createRefund: async (data) => ({ _id: "refund1", ...data })
  };
  const service = createPassengerBookingCancellationRefundService(repository, () => smLedger.clawbackCashback, () => walletService.creditWallet);
  const booking = { _id: "b1", ticketId: "T1" };
  const estimate = { refundAmount: 100, cancellationCharge: 10 };

  const res = await service.processRefundAndClawback(booking, "u1", estimate, "reason", { refundMethod: "original" });
  assert.strictEqual(res._id, "refund1");
  assert.strictEqual(res.status, "pending");
  assert.strictEqual(res.refundGateway, null);
});

test("processRefundAndClawback - wallet method success", async (t) => {
  mock.method(smLedger, "clawbackCashback", async () => { throw new Error("clawback fail"); });
  mock.method(walletService, "creditWallet", async () => true);

  const repository = {
    createRefund: async (data) => data
  };
  const service = createPassengerBookingCancellationRefundService(repository, () => smLedger.clawbackCashback, () => walletService.creditWallet);
  const booking = { _id: "b1", ticketId: "T1" };
  const estimate = { refundAmount: 100, cancellationCharge: 10 };

  const res = await service.processRefundAndClawback(booking, "u1", estimate, "reason", { refundMethod: "wallet" });
  
  assert.strictEqual(res.status, "completed");
  assert.strictEqual(res.refundGateway, "yatra_balance");
  assert.strictEqual(res.remarks, "Refunded instantly to Shuvmarg Money");
});

test("processRefundAndClawback - wallet method fallback", async (t) => {
  mock.method(smLedger, "clawbackCashback", async () => ({ clawedBack: 0 }));
  mock.method(walletService, "creditWallet", async () => { throw new Error("wallet fail"); });

  const repository = {
    createRefund: async (data) => data
  };
  const service = createPassengerBookingCancellationRefundService(repository, () => smLedger.clawbackCashback, () => walletService.creditWallet);
  const booking = { _id: "b1", ticketId: "T1" };
  const estimate = { refundAmount: 100, cancellationCharge: 10 };

  const res = await service.processRefundAndClawback(booking, "u1", estimate, "reason", { refundMethod: "wallet" });
  
  assert.strictEqual(res.status, "pending");
  assert.strictEqual(res.refundGateway, null);
  assert.ok(res.remarks.includes("wallet fail"));
});
