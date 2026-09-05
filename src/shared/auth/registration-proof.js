'use strict';
const crypto = require('crypto');
const mongoose = require('mongoose');
const verificationToken = require('../../../utils/verificationToken');
const AppError = require('../errors/app-error');

const schema = new mongoose.Schema({
  _id: String,
  expiresAt: { type: Date, required: true, expires: 0 },
}, { versionKey: false });
const ConsumedProof = mongoose.models.ConsumedRegistrationProof
  || mongoose.model('ConsumedRegistrationProof', schema);

// Reserve before any identity or referral write. A failed completion requires
// fresh OTP verification; never release a proof after a possibly partial write.
const consume = async (token, phone, purpose) => {
  const result = verificationToken.validateVerificationToken(token, phone, purpose);
  if (!result.valid) throw new AppError(result.error, 400, {
    success: false, message: result.error, errorCode: 'INVALID_VERIFICATION_TOKEN',
  });
  const id = crypto.createHash('sha256').update(token).digest('hex');
  try {
    await ConsumedProof.create({ _id: id, expiresAt: new Date(result.expiresAt * 1000) });
  } catch (error) {
    if (error.code !== 11000) throw error;
    throw new AppError('Verification already used', 409, {
      success: false, message: 'This verification has already been used. Please verify your phone again.',
      errorCode: 'VERIFICATION_ALREADY_USED',
    });
  }
};
module.exports = { consume, ConsumedProof };
