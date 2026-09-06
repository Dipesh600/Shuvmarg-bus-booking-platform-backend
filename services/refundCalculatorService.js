/**
 * services/refundCalculatorService.js
 *
 * Calculates refund amounts based on active RefundPolicy rules.
 *
 * This is a pure calculation module — it does NOT create or modify any
 * database records. It is called from:
 *   1. cancelEstimate endpoint (preview, read-only)
 *   2. cancelTicket handler    (actual cancellation, uses returned values)
 *
 * DESIGN DECISIONS:
 *   - Policies are time-window based (hours before departure)
 *   - If no active policy matches, falls back to 100% refund (operator-friendly default)
 *   - If trip has already departed, cancellation is blocked
 *   - Gateway deduction is currently 0 (eSewa doesn't charge for manual refunds)
 *   - Monetary calculations use paisa and preserve the saved policy when available.
 */

const { toMinorUnits, fromMinorUnits } = require("../src/shared/money");
const { allocateRefund } = require("../src/shared/refund-allocation");
const RefundPolicy = require("../models/refundPolicyModel.js");

/**
 * Combines a trip's date and departure time string into a single Date object.
 *
 * @param {Date}   tripDate       - The trip date (UTC Date from MongoDB)
 * @param {String} departureTime  - "HH:MM" 24-hour format string
 * @returns {Date} Combined departure datetime
 */
function buildDepartureDate(tripDate, departureTime) {
  const date = new Date(tripDate);
  if (departureTime && /^\d{2}:\d{2}$/.test(departureTime)) {
    const [hours, minutes] = departureTime.split(":").map(Number);
    date.setUTCHours(hours, minutes, 0, 0);
  }
  return date;
}

// Uses the saved booking policy when present; historical bookings retain the legacy policy lookup.
async function calculateRefund({
  totalAmount,
  tripDate,
  departureTime,
  currentTime = new Date(),
  policySnapshot = null,
  smMoneyUsed, gatewayAmount, paymentMethod,
}) {
  // 1. Build the actual departure datetime
  const totalMinor = toMinorUnits(totalAmount);
  const departureDate = buildDepartureDate(tripDate, departureTime);
  if (!Number.isFinite(departureDate.getTime()) || !Number.isFinite(currentTime.getTime())) {
    throw new Error("Invalid departure date; refund requires review");
  }

  // 2. Calculate hours until departure
  const msUntilDeparture = departureDate.getTime() - currentTime.getTime();
  const hoursBeforeDeparture = msUntilDeparture / (1000 * 60 * 60);

  // 3. Block if trip has already departed
  if (hoursBeforeDeparture < 0) {
    return {
      eligible: false,
      reason: "This trip has already departed. Cancellation is no longer available.",
      refundAmount: 0,
      cancellationCharge: totalAmount,
      gatewayDeduction: 0,
      refundPercentage: 0,
      hoursBeforeDeparture: Math.round(hoursBeforeDeparture * 10) / 10,
      appliedPolicy: null,
    };
  }

  // 4. Fetch all active refund policies, sorted by minHours ascending
  //    This gives us windows like: [0-12], [12-24], [24-48], [48+]
  if (policySnapshot !== null && (policySnapshot?.version !== 1 || !Array.isArray(policySnapshot.rules))) {
    throw new Error("Saved refund policy is invalid; refund requires review");
  }
  const policies = policySnapshot?.version === 1 && Array.isArray(policySnapshot.rules)
    ? policySnapshot.rules : await RefundPolicy.find({ isActive: true }).sort({ minHours: 1 });

  // 5. Find the matching policy window
  let matchedPolicy = null;

  for (const policy of policies) {
    const minH = policy.minHours || 0;
    const maxH = policy.maxHours; // null = no upper limit (∞)

    if (hoursBeforeDeparture >= minH && (maxH === null || hoursBeforeDeparture < maxH)) {
      matchedPolicy = policy;
      break;
    }
  }

  // 6. Calculate amounts
  let refundPercentage;
  let appliedPolicyInfo;

  if (matchedPolicy) {
    refundPercentage = matchedPolicy.refundPercentage;
    appliedPolicyInfo = {
      id: matchedPolicy._id.toString(),
      name: matchedPolicy.policyName,
      description: matchedPolicy.description,
    };
  } else {
    // No active policy matches — default to 100% refund
    // This is the safe default: don't penalize users if admin hasn't configured policies
    refundPercentage = 100;
    appliedPolicyInfo = {
      id: null,
      name: "Default Policy",
      description: "Full refund (no cancellation policy configured)",
    };
  }

  const gatewayDeduction = 0; // eSewa manual refunds have no gateway fee
  if (!Number.isFinite(refundPercentage) || refundPercentage < 0 || refundPercentage > 100) {
    throw new Error("Invalid refund percentage; policy requires review");
  }
  const cancellationMinor = Math.round(totalMinor * (1 - refundPercentage / 100));
  const cancellationCharge = fromMinorUnits(cancellationMinor);
  const refundAmount = fromMinorUnits(totalMinor - cancellationMinor);

  return {
    eligible: true,
    reason: null,
    refundAmount: Math.max(0, refundAmount),
    ...allocateRefund({ totalAmount, refundAmount, smMoneyUsed, gatewayAmount, paymentMethod }),
    cancellationCharge,
    gatewayDeduction,
    refundPercentage,
    hoursBeforeDeparture: Math.round(hoursBeforeDeparture * 10) / 10,
    appliedPolicy: appliedPolicyInfo,
  };
}

module.exports = {
  calculateRefund,
  buildDepartureDate,
};
