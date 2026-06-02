/**
 * brandFinancialController.js
 *
 * GET /admin/brands/:brandId/financials
 *
 * Returns the full financial picture for a specific Operator Brand.
 * Powers the "Financials" tab in the brand detail page.
 */

const { getBrandFinancialOverview } = require("../../services/brandFinancialService.js");
const logger = require("../../utils/logger.js");

const getBrandFinancials = async (req, res) => {
    try {
        const { brandId } = req.params;

        if (!brandId) {
            return res.status(400).json({ success: false, message: "brandId is required." });
        }

        const data = await getBrandFinancialOverview(brandId);

        return res.status(200).json({
            success: true,
            data,
        });
    } catch (err) {
        logger.error("brandFinancialController: getBrandFinancials error", { error: err.message });
        return res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

module.exports = { getBrandFinancials };
