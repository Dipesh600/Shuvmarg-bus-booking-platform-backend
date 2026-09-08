'use strict';
const crypto = require('node:crypto');
const mongoose = require('mongoose');
const Authorization = require('../../../../models/paymentAuthorizationModel');
const Wallet = require('../../../../models/walletModel');
const { MongoRateLimitStore } = require('../../../shared/http/mongo-rate-limit-store');
const { checkoutFingerprint } = require('../../booking/passenger-esewa-checkout/passenger-esewa-checkout-reservation.service');
const { toMinorUnits } = require('../../../shared/money');
const sends = new MongoRateLimitStore('purchase-authorization-send');
sends.init({ windowMs: 15 * 60000 });
const fail = (message, statusCode = 403) => Object.assign(new Error(message), { statusCode, code: 'PAYMENT_AUTHORIZATION_REQUIRED' });
function fingerprint({ body, hold, quote }) {
  return crypto.createHash('sha256').update(JSON.stringify({
    checkout: checkoutFingerprint(body), holdId: String(hold._id), gateway: body.gateway,
    total: toMinorUnits(quote.finalAmount), sm: toMinorUnits(quote.smMoneyApplied),
    external: toMinorUnits(quote.gatewayAmount),
  })).digest('hex');
}
function hash(id, code) {
  if (!process.env.SECRET_KEY) throw fail('Payment authorization is unavailable.', 503);
  return crypto.createHmac('sha256', process.env.SECRET_KEY).update(`purchase:${id}:${code}`).digest('hex');
}
async function activeWallet(user) {
  if (!user?._id || user.deletedAt || user.forcePasswordChange || ['banned', 'inactive', 'invited'].includes(user.status)) {
    throw fail('This account cannot authorize a payment.');
  }
  const wallet = await Wallet.findOne({ userId: user._id });
  if (!wallet || wallet.status !== 'active') throw fail('SM Money is unavailable for spending.');
}
async function requestAuthorization({ user, hold, body, quote, send = require('../../../../handlers/sparro-otp') }) {
  await activeWallet(user);
  if (!['wallet', 'esewa'].includes(body.gateway) || !(quote.smMoneyApplied > 0)) throw fail('An SM Money purchase is required.', 400);
  if ((await sends.increment(String(user._id))).totalHits > 3) throw fail('Too many payment codes. Try again in 15 minutes.', 429);
  const id = new mongoose.Types.ObjectId();
  const code = String(crypto.randomInt(100000, 1000000));
  const expiresAt = new Date(Math.min(Date.now() + 5 * 60000, new Date(hold.expiresAt).getTime()));
  if (!(expiresAt.getTime() > Date.now())) throw fail('The seat hold expired.', 409);
  await Authorization.create({ _id: id, userId: user._id, holdId: hold._id,
    tempBookingId: hold.tempBookingId, fingerprint: fingerprint({ body, hold, quote }),
    phone: user.phone, tokenVersion: user.tokenVersion || 0, codeHash: hash(id, code), expiresAt });
  try {
    await send(user.phone, `Approve SM Money Rs ${quote.smMoneyApplied} for booking ${hold.tempBookingId}: ${code}. Valid up to 5 minutes. Do not share.`);
    await Authorization.updateOne({ _id: id }, { $set: { deliveredAt: new Date() } });
  } catch {
    await Authorization.deleteOne({ _id: id });
    throw fail('Unable to send the payment code. Please try again later.', 503);
  }
  return { authorizationId: String(id), expiresAt, smMoneyApplied: quote.smMoneyApplied,
    totalAmount: quote.finalAmount, phoneHint: String(user.phone).slice(-4) };
}
async function approveAuthorization({ user, authorizationId, code }) {
  await activeWallet(user);
  if (!mongoose.isValidObjectId(authorizationId) || typeof code !== 'string' || !/^\d{6}$/.test(code)) throw fail('Enter the six-digit payment code.', 400);
  const filter = { _id: authorizationId, userId: user._id, phone: user.phone,
    tokenVersion: user.tokenVersion || 0, deliveredAt: { $ne: null },
    approvedAt: null, expiresAt: { $gt: new Date() }, attempts: { $lt: 5 } };
  const row = await Authorization.findOneAndUpdate(filter, { $inc: { attempts: 1 } }, { new: true }).select('+codeHash');
  if (!row || !crypto.timingSafeEqual(Buffer.from(row.codeHash, 'hex'), Buffer.from(hash(row._id, code), 'hex'))) throw fail('The payment code is incorrect or expired.');
  const approved = await Authorization.updateOne({ _id: row._id, approvedAt: null,
    expiresAt: { $gt: new Date() } }, { $set: { approvedAt: new Date() } });
  if (approved.modifiedCount !== 1) throw fail('This payment code was already used.');
  return { authorizationId: String(row._id) };
}
async function verifyPurchaseAuthorization({ user, hold, body, quote }) {
  await activeWallet(user);
  if (!mongoose.isValidObjectId(body.paymentAuthorizationId)) throw fail('Approve this payment using the code sent to your phone.');
  const row = await Authorization.exists({ _id: body.paymentAuthorizationId, userId: user._id,
    holdId: hold._id, tempBookingId: hold.tempBookingId, phone: user.phone,
    tokenVersion: user.tokenVersion || 0, approvedAt: { $ne: null }, expiresAt: { $gt: new Date() },
    fingerprint: fingerprint({ body, hold, quote }) });
  if (!row) throw fail('Payment approval expired or the booking details changed.');
  // Reuse is confined to the same purchase; the hold and ledger operation key
  // enforce one booking/debit, including retries after an interrupted response.
  return { ok: true };
}
async function authorizeCheckout(input) {
  try {
    const user = input.user || await require('../../../../models/userModel').findById(input.userId).lean();
    return await verifyPurchaseAuthorization({ ...input, user });
  } catch (error) {
    return { ok: false, statusCode: error.statusCode || 503, body: { success: false,
      errorCode: 'PAYMENT_AUTHORIZATION_REQUIRED',
      message: error.statusCode ? error.message : 'Payment authorization is temporarily unavailable.' } };
  }
}
module.exports = { requestAuthorization, approveAuthorization, verifyPurchaseAuthorization, authorizeCheckout, fingerprint };
