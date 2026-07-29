"use strict";

function createFinancialOverviewController({ getOverview, logger }) {
  return async function getFinancialOverview(req, res) {
    try {
      const data = await getOverview(req.query.months);
      return res.status(200).json({ success: true, data });
    } catch (error) {
      logger.error("financialController: getFinancialOverview error", {
        error: error.message,
      });
      return res.status(500).json({
        success: false,
        message: "Internal Server Error",
      });
    }
  };
}

module.exports = { createFinancialOverviewController };
