"use strict";

const pairLifecycle = require("./variant-pair-lifecycle.service.js");

function sendError(res, error) {
  if (!error?.code || !Number.isInteger(error.statusCode)) {
    console.error("[variant-pair-lifecycle] unexpected error", error);
    return res.status(500).json({
      success: false,
      code: "ROUTE_PAIR_INTERNAL_ERROR",
      message: "The route pair could not be updated. Try again shortly.",
    });
  }
  return res.status(error.statusCode).json({
    success: false,
    code: error.code,
    message: error.message,
    ...(error.details !== undefined && { details: error.details }),
  });
}

async function repairVariantPair(req, res) {
  try {
    const data = await pairLifecycle.repairVariantPair(req.params.id, req.adminInfo?.id);
    res.status(200).json({ success: true, message: "Route pair repaired.", data });
  } catch (error) { sendError(res, error); }
}

async function retireVariantPair(req, res) {
  try {
    const data = await pairLifecycle.retireVariantPair(req.params.id, req.adminInfo?.id);
    res.status(200).json({ success: true, message: "Route path retired and preserved in history.", data });
  } catch (error) { sendError(res, error); }
}

module.exports = { repairVariantPair, retireVariantPair };
