"use strict";

const User = require("../../../../models/userModel.js");
const walletService = require("../../../../services/walletService.js");

async function changeWalletStatus(userId, action) {
  const user = await User.findById(userId).select("name phone").lean();
  if (!user) return { notFound: true };
  const wallet = await walletService.getOrCreateWallet(userId);
  const status = action === "freeze" ? "frozen" : "active";
  if (wallet.status === status) return { already: status };
  const previousStatus = wallet.status;
  wallet.status = status;
  await wallet.save();
  return {
    message: `${user.name}'s wallet has been ${action}d`,
    data: {
      walletStatus: status,
      previousStatus,
      balance: wallet.balance,
      user: { name: user.name, phone: user.phone },
    },
  };
}

module.exports = { changeWalletStatus };
