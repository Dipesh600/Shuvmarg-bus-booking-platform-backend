
const { verifyEsewaTransaction } = require("../../services/esewaService.js");
const Transaction = require("../../models/transactionModel.js");

const verifyEsewa = async (req, res) => {
  try {
    const { transactionId, status, totalAmount } = req.body;

    if (!transactionId) {
      return res.status(400).json({
        success: false,
        message: "Please provide transactionId",
      });
    }

    const dbTransaction = await Transaction.findOne({ transactionId });
    if (!dbTransaction) {
      return res.status(404).json({
        success: false,
        message: "Transaction not found",
      });
    }

    if (status !== undefined && String(status).toUpperCase() !== String(dbTransaction.status).toUpperCase()) {
      return res.status(400).json({
        success: false,
        message: "Status mismatch",
      });
    }

    if (totalAmount !== undefined && Number(totalAmount) !== Number(dbTransaction.totalAmount)) {
      return res.status(400).json({
        success: false,
        message: "Total amount mismatch",
      });
    }

    const expectedAmount = Number(dbTransaction.totalAmount);

    const verification = await verifyEsewaTransaction(transactionId, expectedAmount);

    if (verification.success) {
      return res.status(200).json({
        success: true,
        message: verification.message,
        data: {
          transactionId,
          status: verification.status,
          amount: verification.amount,
          totalAmount: expectedAmount,
          dbTransaction,
          esewaVerification: verification,
        },
      });
    } else {
      return res.status(400).json({
        success: false,
        message: verification.message,
        data: {
          transactionId,
          dbTransaction,
          esewaVerification: verification,
        },
      });
    }
  } catch (error) {
    console.error("Payment verification error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error during payment verification",
    });
  }
};

module.exports = {
  verifyEsewa,
};

