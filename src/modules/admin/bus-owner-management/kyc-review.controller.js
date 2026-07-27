"use strict";

const { isValidObjectId } = require("./request-validation.policy.js");
const { reviewKyc } = require("./kyc-review.service.js");
const { notifyKycResult } = require("./kyc-notification.service.js");

const updateBusOwnerKyc = async (req, res) => {
  try {
    const { id } = req.body;
    if (!id) {
      return res.status(400).json({ success: false, message: "Id is required!" });
    }
    if (!isValidObjectId(id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid id format!" });
    }
    const result = await reviewKyc(req.body, req.adminInfo?.id);
    if (result.statusCode) {
      return res
        .status(result.statusCode)
        .json({ success: false, message: result.message });
    }
    await notifyKycResult(result);
    return res.status(200).json({
      success: true,
      message: "Bus owner KYC updated successfully!",
    });
  } catch (error) {
    console.error("updateBusOwnerKyc error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal Server Error!" });
  }
};

module.exports = { updateBusOwnerKyc };
