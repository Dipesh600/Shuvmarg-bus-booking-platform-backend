"use strict";
const { toMinorUnits, fromMinorUnits } = require("./money");

function allocateRefund({ totalAmount, refundAmount, smMoneyUsed, gatewayAmount, paymentMethod }) {
  const total = toMinorUnits(totalAmount);
  let sm = toMinorUnits(smMoneyUsed ?? 0);
  let gateway = toMinorUnits(gatewayAmount ?? 0);
  if (sm + gateway === 0 && paymentMethod === "SM_WALLET") sm = total;
  if (sm + gateway === 0 && ["ESEWA", "KHALTI", "CASH", "AGENT"].includes(paymentMethod)) gateway = total;
  if (sm + gateway !== total) return { allocationKnown: false };
  const refundable = toMinorUnits(refundAmount);
  if (refundable > total) throw new Error("Refund exceeds original payment");
  const smRefund = total ? Number((BigInt(refundable) * BigInt(sm) + BigInt(total) / 2n) / BigInt(total)) : 0;
  return { allocationKnown: true, smRefundAmount: fromMinorUnits(smRefund),
    gatewayRefundAmount: fromMinorUnits(refundable - smRefund) };
}

module.exports = { allocateRefund };
