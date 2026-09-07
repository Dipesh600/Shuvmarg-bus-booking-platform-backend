"use strict";

const policy = require("./wallet-adjustment.policy.js");
const adjustments = require("./wallet-adjustment.service.js");
const statusChanges = require("./wallet-status.service.js");

async function adjustBalance(req, res) {
  try {
    const errorMessage = policy.validateAdjustment(req.body);
    if (errorMessage) {
      return res.status(400).json({
        status: false, message: errorMessage,
      });
    }
    const result = await adjustments.adjustWallet(
      req.adminInfo?.id, req.body
    );
    if (!result) {
      return res.status(404).json({
        status: false, message: "User not found",
      });
    }
    return res.status(200).json({
      status: true, message: result.message, data: result.data,
    });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ status: false, message: error.message });
    if (
      error.message.includes("Insufficient") ||
      error.message.includes("frozen")
    ) {
      return res.status(400).json({
        status: false, message: error.message,
      });
    }
    console.error("Admin wallet adjustment error:", error);
    return res.status(500).json({
      status: false, message: "Internal Server Error",
    });
  }
}

async function freezeWallet(req, res) {
  try {
    const errorMessage = policy.validateStatusChange(req.body);
    if (errorMessage) {
      return res.status(400).json({
        status: false, message: errorMessage,
      });
    }
    const result = await statusChanges.changeWalletStatus(
      req.body.userId, req.body.action, { adminId: req.adminInfo?.id,
        remarks: req.body.remarks, operationId: req.body.operationId }
    );
    if (result.notFound) {
      return res.status(404).json({
        status: false, message: "User not found",
      });
    }
    if (result.already) {
      return res.status(400).json({
        status: false, message: `Wallet is already ${result.already}`,
      });
    }
    return res.status(200).json({
      status: true, message: result.message, data: result.data,
    });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ status: false, message: error.message });
    console.error("Admin wallet freeze error:", error);
    return res.status(500).json({
      status: false, message: "Internal Server Error",
    });
  }
}

module.exports = { adjustBalance, freezeWallet };
