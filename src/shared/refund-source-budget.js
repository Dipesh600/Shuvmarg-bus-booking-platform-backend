"use strict";
const { allocateRefund } = require("./refund-allocation");
const { toMinorUnits, fromMinorUnits } = require("./money");

function sourceBudget(booking, refunds) {
  const paid = allocateRefund({ ...booking, refundAmount: booking.totalAmount });
  if (!paid.allocationKnown) return { allocationKnown: false };
  let sm = 0; let gateway = 0; let total = 0;
  for (const refund of refunds) {
    const allocation = refund.paymentAllocation || allocateRefund({ ...booking, refundAmount: refund.refundAmount });
    if (!allocation.allocationKnown) throw new Error("Historical refund allocation requires reconciliation");
    const smMinor = toMinorUnits(allocation.smRefundAmount);
    const gatewayMinor = toMinorUnits(allocation.gatewayRefundAmount);
    if (smMinor + gatewayMinor !== toMinorUnits(refund.refundAmount)) throw new Error("Refund allocation does not match its amount");
    sm += smMinor; gateway += gatewayMinor; total += smMinor + gatewayMinor;
  }
  if (sm > toMinorUnits(paid.smRefundAmount) || gateway > toMinorUnits(paid.gatewayRefundAmount)) {
    throw new Error("Cumulative refund exceeds an original payment source");
  }
  return { allocationKnown: true, sm, gateway, total };
}

function reserveSourceAllocation(booking, refunds, amount) {
  const used = sourceBudget(booking, refunds);
  if (!used.allocationKnown) return used;
  // Allocate the increment of the cumulative entitlement so repeated paisa-sized
  // refunds cannot round one payment source above its original contribution.
  const target = allocateRefund({ ...booking, refundAmount: fromMinorUnits(used.total + toMinorUnits(amount)) });
  const sm = toMinorUnits(target.smRefundAmount) - used.sm;
  const gateway = toMinorUnits(target.gatewayRefundAmount) - used.gateway;
  if (sm < 0 || gateway < 0) throw new Error("Historical refund rounding requires reconciliation");
  return { allocationKnown: true, smRefundAmount: fromMinorUnits(sm), gatewayRefundAmount: fromMinorUnits(gateway) };
}
module.exports = { sourceBudget, reserveSourceAllocation };
