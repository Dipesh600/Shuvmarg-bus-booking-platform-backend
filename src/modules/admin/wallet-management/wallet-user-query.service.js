"use strict";

const Wallet = require("../../../../models/walletModel.js");
const User = require("../../../../models/userModel.js");
const walletService = require("../../../../services/walletService.js");
const ledgerService = require("../../wallet/sm-ledger");

function userFilter(searchTerm) {
  if (/^[0-9a-fA-F]{24}$/.test(searchTerm)) return { _id: searchTerm };
  if (
    /^[0-9+\-() ]+$/.test(searchTerm) &&
    searchTerm.replace(/\D/g, "").length >= 7
  ) {
    return {
      phone: {
        $regex: searchTerm.replace(/\D/g, ""), $options: "i",
      },
    };
  }
  return { name: { $regex: searchTerm, $options: "i" } };
}

async function lookupUserWallet(searchTerm, page, limit) {
  const user = await User.findOne(userFilter(searchTerm))
    .select("name email phone status profilePicture role createdAt")
    .lean();
  if (!user) return null;
  const wallet = await walletService.getOrCreateWallet(user._id);
  const pageNumber = Math.max(1, parseInt(page) || 1);
  const limitNumber = Math.min(100, Math.max(1, parseInt(limit) || 20));
  const balance = await walletService.getFullBalance(user._id);
  const activity = await ledgerService.getActivityFeed(user._id, {
    page: pageNumber, limit: limitNumber,
  });
  return {
    user: {
      _id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      status: user.status,
      profilePicture: user.profilePicture,
      role: user.role,
      joinedAt: user.createdAt,
    },
    wallet: {
      _id: wallet._id,
      balance: balance.spendableBalance,
      lockedBalance: balance.lockedBalance,
      isNegative: balance.isNegative,
      expiringAmount: balance.expiringAmount,
      currency: wallet.currency,
      status: wallet.status,
      legacyBalance: wallet.legacyBalance,
      createdAt: wallet.createdAt,
      updatedAt: wallet.updatedAt,
    },
    activities: activity.entries,
    pagination: activity.pagination,
  };
}

async function getUserBalance(userId) {
  const wallet = await Wallet.findOne({ userId })
    .select("balance currency status").lean();
  if (!wallet) {
    return {
      balance: 0, lockedBalance: 0, currency: "NPR",
      walletStatus: "active", exists: false,
    };
  }
  const balance = await walletService.getFullBalance(userId);
  return {
    balance: balance.spendableBalance,
    lockedBalance: balance.lockedBalance,
    currency: wallet.currency,
    walletStatus: wallet.status,
    exists: true,
  };
}

module.exports = { lookupUserWallet, getUserBalance, userFilter };
