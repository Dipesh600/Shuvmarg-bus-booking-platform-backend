"use strict";

const User = require("../../../../models/userModel.js");
const walletService = require("../../../../services/walletService.js");

async function adjustWallet(adminId, data) {
  const { userId, type, amount, purpose, remarks } = data;
  const parsedAmount = parseFloat(amount);
  const user = await User.findById(userId).select("name phone").lean();
  if (!user) return null;
  const input = {
    userId,
    amount: parsedAmount,
    purpose,
    referenceType: "admin",
    referenceId: adminId,
    remarks: `[ADMIN: ${adminId}] ${remarks.trim()}`,
  };
  const result = type === "credit"
    ? await walletService.creditWallet(input)
    : await walletService.debitWallet(input);
  return {
    message:
      `Successfully ${type}ed Rs. ${parsedAmount} ` +
      `${type === "credit" ? "to" : "from"} ${user.name}'s Shuvmarg Money`,
    data: {
      ledgerEntry: result.ledgerEntry,
      user: { name: user.name, phone: user.phone },
    },
  };
}

module.exports = { adjustWallet };
