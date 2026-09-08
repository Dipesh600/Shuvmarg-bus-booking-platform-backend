"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createPassengerOperatorRefundDestinationService } = require(
  "../../../src/modules/booking/passenger-booking-cancellation/passenger-operator-refund-destination.service"
);

function fixture(overrides = {}) {
  const refund = { _id: "r1", userId: "u1", bookingId: "b1", refundAmount: 500,
    status: "pending", destination: null, save: async () => refund };
  const booking = { _id: "b1", userId: "u1", ticketId: "T1", status: "cancelled",
    cancelledBy: "admin", refundId: "r1" };
  const calls = [];
  const repository = {
    withTransaction: (work) => work("session"),
    findBookingByTicketId: async () => booking,
    findRefundForBooking: async () => refund,
    claimRefundDestination: async (_id, _userId, destination) => {
      refund.destination = destination;
      return refund;
    },
    saveRefund: async (row) => (calls.push(["save", row.destination, row.status]), row),
    ...overrides.repository,
  };
  const creditWallet = async (input) => {
    calls.push(["credit", input]);
    return { ledgerEntry: { _id: "ledger-1" } };
  };
  return { service: createPassengerOperatorRefundDestinationService(repository,
    () => overrides.creditWallet || creditWallet), refund, booking, calls };
}

test("operator-cancellation refund destination is owned, one-time and transactional", async (t) => {
  await t.test("original source remains pending for settlement", async () => {
    const h = fixture();
    const result = await h.service.selectOperatorRefundDestination("T1", "u1", "original");
    assert.deepEqual(result, { refundId: "r1", destination: "original", refundAmount: 500, status: "pending" });
    assert.equal(h.calls.some(([kind]) => kind === "credit"), false);
  });

  await t.test("SM Money is credited and completed inside the transaction", async () => {
    const h = fixture();
    const result = await h.service.selectOperatorRefundDestination("T1", "u1", "wallet");
    assert.equal(result.status, "completed");
    assert.equal(h.refund.refundGateway, "yatra_balance");
    assert.deepEqual(h.refund.settlementEvidence, { kind: "ledger", ledgerEntryId: "ledger-1" });
    assert.equal(h.calls[0][0], "credit");
    assert.equal(h.calls[0][1].session, "session");
  });

  await t.test("another passenger and changed destination are rejected", async () => {
    const h = fixture();
    await assert.rejects(() => h.service.selectOperatorRefundDestination("T1", "attacker", "wallet"),
      /Booking not found/);
    h.refund.destination = "original";
    await assert.rejects(() => h.service.selectOperatorRefundDestination("T1", "u1", "wallet"),
      /already locked/);
  });

  await t.test("only operator cancellations and valid destinations qualify", async () => {
    const h = fixture();
    h.booking.cancelledBy = "user";
    await assert.rejects(() => h.service.selectOperatorRefundDestination("T1", "u1", "wallet"),
      /only after an operator cancellation/);
    await assert.rejects(() => h.service.selectOperatorRefundDestination("T1", "u1", "bank"),
      /Invalid refund destination/);
  });
});
