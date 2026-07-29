"use strict";

const overview = require("./wallet-overview.service.js");
const feed = require("./global-ledger-feed.service.js");
const users = require("./wallet-user-query.service.js");

async function getOverview(req, res) {
  try {
    const data = await overview.getWalletOverview();
    return res.status(200).json({
      status: true, message: "Wallet platform overview", data,
    });
  } catch (error) {
    console.error("Admin wallet overview error:", error);
    return res.status(500).json({
      status: false, message: "Internal Server Error",
    });
  }
}

async function getGlobalFeed(req, res) {
  try {
    const data = await feed.getGlobalLedgerFeed(req.query);
    return res.status(200).json({
      status: true, message: "Global transaction feed", data,
    });
  } catch (error) {
    console.error("Admin global feed error:", error);
    return res.status(500).json({
      status: false, message: "Internal Server Error",
    });
  }
}

async function lookupUser(req, res) {
  try {
    const { query, page = 1, limit = 20 } = req.query;
    if (!query || query.trim().length < 2) {
      return res.status(400).json({
        status: false,
        message: "Search query must be at least 2 characters",
      });
    }
    const data = await users.lookupUserWallet(query.trim(), page, limit);
    if (!data) {
      return res.status(404).json({
        status: false,
        message: "No user found matching the search query",
      });
    }
    return res.status(200).json({
      status: true, message: "User wallet details retrieved", data,
    });
  } catch (error) {
    console.error("Admin wallet lookup error:", error);
    return res.status(500).json({
      status: false, message: "Internal Server Error",
    });
  }
}

async function getUserBalance(req, res) {
  try {
    const { userId } = req.params;
    if (!userId || !/^[0-9a-fA-F]{24}$/.test(userId)) {
      return res.status(400).json({
        status: false, message: "Valid userId is required",
      });
    }
    const data = await users.getUserBalance(userId);
    return res.status(200).json({ status: true, data });
  } catch (error) {
    console.error("Admin user balance error:", error);
    return res.status(500).json({
      status: false, message: "Internal Server Error",
    });
  }
}

module.exports = { getOverview, getGlobalFeed, lookupUser, getUserBalance };
