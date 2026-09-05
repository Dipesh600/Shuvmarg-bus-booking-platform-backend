'use strict';
const bcrypt = require('bcryptjs');
const Wallet = require('../../../../models/walletModel');
const { getOrCreateWallet } = require('../../../../services/walletService');
const pinService = require('./wallet-pin.service');

async function setupWalletPin(req, res) {
  const { pin } = req.body || {};
  if (typeof pin !== 'string' || !/^\d{4}$/.test(pin)) {
    return res.status(400).json({ status: false, message: 'PIN must be exactly 4 digits' });
  }
  try {
    const userId = req.userInfo.id;
    await getOrCreateWallet(userId);
    const saved = await Wallet.findOneAndUpdate({ userId, isPinSet: { $ne: true }, status: 'active' },
      { $set: { pin: await bcrypt.hash(pin, 10), isPinSet: true } }, { new: true });
    if (!saved) return res.status(409).json({ status: false, message: 'Wallet PIN is already set or the wallet is unavailable.' });
    return res.status(200).json({ status: true, message: 'Wallet PIN set successfully' });
  } catch {
    return res.status(500).json({ status: false, message: 'Unable to set wallet PIN.' });
  }
}
async function verifyWalletPin(req, res) {
  try {
    const result = await pinService.verifyPaymentPin({ userId: req.userInfo.id, pin: req.body?.pin });
    if (!result.ok) return res.status(result.statusCode).json(result.body);
    // This endpoint is a UI check. The payment request must supply walletPin
    // again, where it is verified against that request's server-calculated quote.
    return res.status(200).json({ status: true, message: 'PIN verified successfully' });
  } catch {
    return res.status(503).json({ status: false, message: 'Wallet authorization is temporarily unavailable.' });
  }
}
module.exports = { setupWalletPin, verifyWalletPin };
