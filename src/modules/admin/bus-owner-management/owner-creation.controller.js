"use strict";

const { createBusOwner } = require("./owner-creation.service.js");
const {
  hasRequiredOwnerFields,
} = require("./request-validation.policy.js");

const createBusOwnerFull = async (req, res) => {
  try {
    if (!hasRequiredOwnerFields(req.body)) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields for Company or Bank details.",
      });
    }
    const result = await createBusOwner(req.body, req.files || {});
    if (result.error) return res.status(400).json(result.error);
    return res.status(201).json({
      success: true,
      message: "Bus Owner registered successfully with PENDING KYC status.",
      busOwnerId: result.owner.busOwnerId,
      userId: result.user._id,
    });
  } catch (error) {
    console.error("createBusOwnerFull error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Internal Server Error!",
    });
  }
};

module.exports = { createBusOwnerFull };
