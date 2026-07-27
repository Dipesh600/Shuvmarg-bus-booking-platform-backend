"use strict";

const createCouponReadController = ({
  readService,
  isValidId,
  console: output = console,
}) => {
  const getAllCoupons = async (req, res) => {
    try {
      const result = await readService.list(req.query);
      return res.status(result.statusCode).json(result.body);
    } catch (error) {
      output.error("Error fetching coupons:", error);
      return res.status(500).json({
        success: false,
        message: "Internal Server Error!",
      });
    }
  };

  const getCouponById = async (req, res) => {
    try {
      const { id } = req.params;
      if (!id) {
        return res.status(400).json({
          success: false,
          message: "Coupon ID is required!",
        });
      }
      if (!isValidId(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid coupon ID format!",
        });
      }
      const result = await readService.getById(id);
      return res.status(result.statusCode).json(result.body);
    } catch (error) {
      output.error("Error fetching coupon:", error);
      return res.status(500).json({
        success: false,
        message: "Internal Server Error!",
      });
    }
  };

  return { getAllCoupons, getCouponById };
};

module.exports = { createCouponReadController };
