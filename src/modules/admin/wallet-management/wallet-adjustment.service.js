"use strict";

const User = require("../../../../models/userModel.js");
const walletService = require("../../../../services/walletService.js");
const operations = require("../../../shared/financial-operation");
const { toMinorUnits, fromMinorUnits } = require("../../../shared/money");

async function adjustWallet(adminId, data) {
  const { userId, type, amount, purpose, remarks } = data;
  const parsedAmount = fromMinorUnits(toMinorUnits(amount, { allowZero: false }));
  const user = await User.findById(userId).select("name phone").lean();
  if (!user) return null;
  const input = {
    userId,
    amount: parsedAmount,
    purpose: purpose === "reversal" ? "admin_adjustment" : purpose,
    referenceType: "admin",
    referenceId: adminId,
    remarks: `[ADMIN: ${adminId}] ${remarks.trim()}`,
  };
  return operations.runOperation({ scope: "admin-wallet-adjustment", operationId: data.operationId,
    actorId: adminId, payload: { ...input, type }, work: async session => {
    const result = type === "credit"
      ? await walletService.creditWallet({ ...input, session })
      : await walletService.debitWallet({ ...input, session });
    return {
    message:
      `Successfully ${type}ed Rs. ${parsedAmount} ` +
      `${type === "credit" ? "to" : "from"} ${user.name}'s Shuvmarg Money`,
    data: {
      ledgerEntry: result.ledgerEntry,
      user: { name: user.name, phone: user.phone },
    },
    };
  } });
}

module.exports = { adjustWallet };
