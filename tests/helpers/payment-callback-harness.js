"use strict";
const crypto = require("node:crypto");
const axios = require("axios");
const fixture = require("./security-cancellation-fixtures");
const Attempt = require("../../models/esewaPaymentAttemptModel");
const Hold = require("../../models/seatHoldModel");
const Transaction = require("../../models/transactionModel");
const Trip = require("../../models/tripModel");
const { createReservedAttempt } = require("../../src/modules/booking/passenger-esewa-checkout/passenger-esewa-checkout-reservation.service");
const { createPassengerEsewaCheckoutRepository } = require("../../src/modules/booking/passenger-esewa-checkout/passenger-esewa-checkout.repository");
const { createPassengerEsewaCheckoutFinalizationService } = require("../../src/modules/booking/passenger-esewa-checkout/passenger-esewa-checkout-finalization.service");
const { createPassengerEsewaCheckoutRecoveryService } = require("../../src/modules/booking/passenger-esewa-checkout/passenger-esewa-checkout-recovery.service");
const { createPassengerEsewaCheckoutController } = require("../../src/modules/booking/passenger-esewa-checkout/passenger-esewa-checkout.controller");
const { validateEsewaResponse } = require("../../src/modules/booking/passenger-esewa-checkout/passenger-esewa-checkout-response.service");
const signature = require("../../src/modules/booking/passenger-esewa-checkout/passenger-esewa-checkout.signature");
const mapper = require("../../src/modules/booking/passenger-esewa-checkout/passenger-esewa-checkout.mapper");
const { readEsewaCheckoutConfig } = require("../../src/modules/booking/passenger-esewa-checkout/passenger-esewa-checkout.config");
const { verifyEsewaPayment } = require("../../services/esewaVerificationService");
const { commitPaymentBooking } = require("../../src/shared/commit-payment-booking");
const { createAttemptTransaction } = require("../../src/shared/create-attempt-transaction");
const secret = "callback-test-secret";
let originalGet, previous;
async function start() {
  originalGet = axios.get;
  previous = Object.fromEntries(["NODE_ENV", "DEPLOYMENT_ENV", "ESEWA_PRODUCT_CODE", "ESEWA_SECRET_KEY", "ESEWA_STATUS_URL", "ESEWA_PAYMENT_URL", "PASSENGER_APP_URL"].map(key => [key, process.env[key]]));
  Object.assign(process.env, { NODE_ENV: "production", DEPLOYMENT_ENV: "staging", ESEWA_PRODUCT_CODE: "EPAYTEST", ESEWA_SECRET_KEY: secret, PASSENGER_APP_URL: "https://passenger.example" });
  delete process.env.ESEWA_STATUS_URL; delete process.env.ESEWA_PAYMENT_URL;
  await fixture.start(); await Promise.all([Attempt.init(), Hold.init(), Transaction.init()]);
}
async function stop() {
  axios.get = originalGet;
  for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  await fixture.stop();
}
function callback(overrides = {}, key = secret) {
  const payload = { transaction_code: "TEST-RECEIPT", status: "COMPLETE", total_amount: "960.00",
    transaction_uuid: "CALLBACK-TEST", product_code: "EPAYTEST", signed_field_names: signature.RESPONSE_SIGNED_FIELDS.join(","), ...overrides };
  const message = payload.signed_field_names.split(",").map(field => `${field}=${payload[field]}`).join(",");
  payload.signature = crypto.createHmac("sha256", key).update(message).digest("base64");
  return Buffer.from(JSON.stringify(payload)).toString("base64");
}
async function seed() {
  const data = await fixture.seed();
  await Promise.all([Attempt, Hold, Transaction, fixture.Booking, fixture.Ledger].map(model => model.deleteMany({})));
  await Trip.updateOne({ _id: data.tripId }, { $set: { status: "scheduled" } });
  await fixture.Seat.updateOne({ tripId: data.tripId }, { $set: { "seata.0.booked": false } });
  await fixture.Ledger.create({ userId: data.userId, type: "ADMIN_CREDIT", direction: "CREDIT", status: "ACTIVE", amount: 100, remainingAmount: 100, expires_at: new Date("2099-01-01") });
  const hold = await Hold.create({ userId: data.userId, tripId: data.tripId, tempBookingId: "CALLBACK-HOLD", seatNumbers: ["a1"], status: "held", expiresAt: new Date(Date.now() + 60000) });
  const attempt = await createReservedAttempt({ userId: data.userId, holdId: hold._id, tempBookingId: hold.tempBookingId,
    transactionUuid: "CALLBACK-TEST", productCode: "EPAYTEST", paymentEnvironment: "sandbox", originalAmount: 1000, finalAmount: 1000,
    gatewayAmount: 960, smMoneyApplied: 40, walletAuthorizedAt: new Date(), requestFingerprint: "same",
    confirmationQuote: {}, checkoutPayload: { scheduleId: data.tripId, seatNumbers: ["a1"] }, formFields: {}, holdExpiresAt: hold.expiresAt });
  const repository = createPassengerEsewaCheckoutRepository({ EsewaPaymentAttempt: Attempt, SeatHold: Hold, Transaction, Trip });
  const state = { providerCalls: 0, bookings: 0, provider: { status: "COMPLETE", transaction_uuid: attempt.transactionUuid, product_code: "EPAYTEST", total_amount: "960.00" } };
  axios.get = async () => { state.providerCalls++; return { data: state.provider }; };
  const recovery = createPassengerEsewaCheckoutRecoveryService({ repository, mapper, ...require("../../src/shared/payment-attempt-recovery") });
  const finalize = createPassengerEsewaCheckoutFinalizationService({ repository, mapper, recovery, signature,
    readConfig: readEsewaCheckoutConfig, validateResponse: validateEsewaResponse, verifyPayment: verifyEsewaPayment,
    orchestrate: async ({ req }) => {
      state.bookings++;
      const ownership = { attemptId: req.paymentAttemptId, processingToken: req.paymentProcessingToken };
      await createAttemptTransaction({ userId: data.userId, tripId: data.tripId, transactionId: attempt.transactionUuid, totalAmount: 1000, gateway: "esewa", transactionType: "BOOKING", status: "PAYMENT_RECEIVED" }, ownership);
      await Hold.updateOne({ _id: hold._id }, { $set: { status: "processing" } });
      const booking = await commitPaymentBooking({ userId: data.userId, tripId: data.tripId, seats: ["A1"], ticketId: "CALLBACK-TICKET", originalAmount: 1000,
        totalAmount: 1000, gatewayAmount: 960, smMoneyUsed: 40, smDebitEntryId: attempt.reservedLedgerEntryId,
        transactionId: attempt.transactionUuid, paymentMethod: "SM_WALLET_SPLIT" }, { ...ownership, holdId: hold._id });
      return { statusCode: 201, body: { success: true, data: { bookingId: booking._id } } };
    },
  });
  const controller = createPassengerEsewaCheckoutController({ service: { finalize }, mapper });
  async function request(body, userId = data.userId) {
    let response;
    await controller.finalizePassengerEsewaCheckout({ body, dbUser: { _id: userId }, userInfo: { activeRole: "passenger" } },
      { status(statusCode) { this.statusCode = statusCode; return this; }, json(body) { response = { statusCode: this.statusCode, body }; } });
    return response;
  }
  return { ...data, attempt, hold, state, request };
}
module.exports = { start, stop, seed, callback, Attempt, fixture };
