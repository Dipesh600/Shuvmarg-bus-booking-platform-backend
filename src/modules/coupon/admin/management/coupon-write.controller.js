"use strict";

const createCouponWriteController = ({
  creationService,
  updateService,
  stateService,
  isValidId,
  console: output = console,
}) => {
  const respond = (res, result) =>
    res.status(result.statusCode).json(result.body);
  const validateId = (id) => {
    if (!id) return "Coupon ID is required!";
    if (!isValidId(id)) return "Invalid coupon ID format!";
    return null;
  };

  const createCoupon = async (req, res) => {
    try {
      return respond(
        res,
        await creationService.create(req.body, req.adminInfo)
      );
    } catch (error) {
      output.error("Error creating coupon:", error);
      return res.status(500).json({
        success: false,
        message: "Internal Server Error!",
      });
    }
  };

  const updateCoupon = async (req, res) => {
    try {
      const message = validateId(req.params.id);
      if (message) return res.status(400).json({ success: false, message });
      return respond(
        res,
        await updateService.update(
          req.params.id,
          req.body,
          req.adminInfo
        )
      );
    } catch (error) {
      output.error("Error updating coupon:", error);
      return res.status(500).json({
        success: false,
        message: "Internal Server Error!",
      });
    }
  };

  const deleteCoupon = async (req, res) => {
    try {
      const message = validateId(req.params.id);
      if (message) return res.status(400).json({ success: false, message });
      return respond(res, await stateService.remove(req.params.id));
    } catch (error) {
      output.error("Error deleting coupon:", error);
      return res.status(500).json({
        success: false,
        message: "Internal Server Error!",
      });
    }
  };

  const toggleCouponStatus = async (req, res) => {
    try {
      const message = validateId(req.params.id);
      if (message) return res.status(400).json({ success: false, message });
      return respond(
        res,
        await stateService.toggle(req.params.id, req.adminInfo)
      );
    } catch (error) {
      output.error("Error toggling coupon status:", error);
      return res.status(500).json({
        success: false,
        message: "Internal Server Error!",
      });
    }
  };

  return { createCoupon, updateCoupon, deleteCoupon, toggleCouponStatus };
};

module.exports = { createCouponWriteController };
