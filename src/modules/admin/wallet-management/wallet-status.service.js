"use strict";

const User = require("../../../../models/userModel.js");
const Wallet = require("../../../../models/walletModel.js");
const operations = require("../../../shared/financial-operation");

async function changeWalletStatus(userId, action, { adminId, remarks, operationId } = {}) {
  const user = await User.findById(userId).select("name phone").lean();
  if (!user) return { notFound: true };
  if (!adminId || !['freeze', 'unfreeze'].includes(action) || typeof remarks !== 'string' || remarks.trim().length < 10 || remarks.length > 2000) {
    throw Object.assign(new Error('Administrator and explanatory remarks are required'), { statusCode: 400 });
  }
  return operations.runOperation({ scope: 'admin-wallet-status', operationId, actorId: adminId,
    payload: { userId: String(userId), action, remarks: remarks.trim() }, work: async session => {
  const wallet = await Wallet.findOneAndUpdate({ userId }, { $setOnInsert: { status: 'active' } },
    { session, new: true, upsert: true });
  const status = action === "freeze" ? "frozen" : "active";
  if (wallet.status === status) return { already: status };
  const previousStatus = wallet.status;
  wallet.status = status;
  await wallet.save({ session });
  return {
    message: `${user.name}'s wallet has been ${action}d`,
    data: {
      walletStatus: status,
      previousStatus,
      balance: wallet.balance,
      user: { name: user.name, phone: user.phone },
    },
  };
  } });
}

module.exports = { changeWalletStatus };
