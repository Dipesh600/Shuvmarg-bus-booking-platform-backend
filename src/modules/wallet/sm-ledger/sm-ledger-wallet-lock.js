"use strict";
const Wallet = require("../../../../models/walletModel");

async function lockWalletForDebit(userId, session) {
  const wallet = await Wallet.findOneAndUpdate(
    { userId, status: "active" }, { $inc: { debitSequence: 1 } }, { session, new: true }
  );
  if (!wallet) throw new Error("Wallet is frozen or unavailable. Contact support.");
}

module.exports = { lockWalletForDebit };
