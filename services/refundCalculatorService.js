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
 *   - All monetary calculations round to nearest integer (NPR has no subunits)
 */

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

/**
 * Calculates the refund breakdown for a given booking.
 *
 * @param {Object} params
 * @param {Number} params.totalAmount     - The amount the passenger paid
 * @param {Date}   params.tripDate        - Trip date (from Trip document)
 * @param {String} params.departureTime   - "HH:MM" departure time string
 * @param {Date}   [params.currentTime]   - Override for testing (defaults to now)
 * @returns {Promise<Object>} Refund calculation result
 *
 * Return shape:
 * {
 *   eligible:           Boolean,
 *   reason:             String | null,
 *   refundAmount:       Number,
 *   cancellationCharge: Number,
 *   gatewayDeduction:   Number,
 *   refundPercentage:   Number,
 *   hoursBeforeDeparture: Number,
 *   appliedPolicy: {
 *     id:   String,
 *     name: String,
 *     description: String,
 *   } | null,
 * }
 */
async function calculateRefund({
  totalAmount,
  tripDate,
  departureTime,
  currentTime = new Date(),
}) {
  // 1. Build the actual departure datetime
  const departureDate = buildDepartureDate(tripDate, departureTime);

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
  const policies = await RefundPolicy.find({ isActive: true }).sort({ minHours: 1 });

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
  const cancellationCharge = Math.round(totalAmount * (1 - refundPercentage / 100));
  const refundAmount = Math.round(totalAmount - cancellationCharge - gatewayDeduction);

  return {
    eligible: true,
    reason: null,
    refundAmount: Math.max(0, refundAmount),
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
