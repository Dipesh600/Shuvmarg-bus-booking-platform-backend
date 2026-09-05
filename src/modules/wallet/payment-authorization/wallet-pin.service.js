'use strict';
const bcrypt = require('bcryptjs');
const Wallet = require('../../../../models/walletModel');
const { MongoRateLimitStore } = require('../../../shared/http/mongo-rate-limit-store');
const attempts = new MongoRateLimitStore('wallet-pin');
attempts.init({ windowMs: 15 * 60 * 1000 });
const fail = (statusCode, message, errorCode) => ({ ok: false, statusCode,
  body: { success: false, status: false, message, errorCode } });

async function verifyPaymentPin({ userId, pin }) {
  if (!userId || typeof pin !== 'string' || !/^\d{4}$/.test(pin)) {
    return fail(400, 'Enter your 4-digit wallet PIN to authorize this payment.', 'WALLET_PIN_REQUIRED');
  }
  const key = String(userId);
  const attempt = await attempts.increment(key);
  if (attempt.totalHits > 5) {
    return fail(429, 'Too many wallet PIN attempts. Try again in 15 minutes.', 'WALLET_PIN_LOCKED');
  }
  const wallet = await Wallet.findOne({ userId });
  if (!wallet?.isPinSet || !wallet.pin) return fail(400, 'Set your wallet PIN first.', 'WALLET_PIN_NOT_SET');
  if (wallet.status !== 'active') return fail(403, 'Wallet is frozen. Please contact support.', 'WALLET_FROZEN');
  if (!await bcrypt.compare(pin, wallet.pin)) return fail(401, 'Incorrect PIN. Please try again.', 'WALLET_PIN_INCORRECT');
  await attempts.decrement(key);
  return { ok: true };
}
module.exports = { verifyPaymentPin };
