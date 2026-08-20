"use strict";

const variants = require("./route-variant-registry.service.js");
const sequences = require("./route-stop-sequence.service.js");
const revisions = require("./variant-revision.service.js");
const {
  VARIANT_WRITE_CONTEXT,
} = require("./variant-lifecycle.policy.js");

function sendError(res, error, fallbackStatus = 400) {
  if (!error?.code || !Number.isInteger(error.statusCode)) {
    console.error("[route-variant-registry] unexpected error", error);
    return res.status(500).json({
      success: false,
      code: "ROUTE_VARIANT_INTERNAL_ERROR",
      message: "The route variant could not be updated. Try again shortly.",
    });
  }
  const status = error.statusCode ||
    (String(error.message || "").includes("not found") ? 404 : fallbackStatus);
  return res.status(status).json({
    success: false,
    ...(error.code && { code: error.code }),
    message: error.message || "The route variant could not be updated.",
    ...(error.details !== undefined && { details: error.details }),
  });
}

async function createVariant(req, res) {
  try {
    const data = await variants.createVariant(req.body, req.adminInfo?.id);
    res.status(201).json({
      success: true, message: "Route variant created.", data,
    });
  } catch (error) {
    sendError(res, error);
  }
}

async function getVariantsByCorridor(req, res) {
  try {
    const data = await variants.getVariantsByCorridor(
      req.params.corridorId, req.query
    );
    res.status(200).json({ success: true, results: data.length, data });
  } catch (error) {
    sendError(res, error);
  }
}

async function getVariantDetails(req, res) {
  try {
    const data = await revisions.getVariantDetails(req.params.id);
    res.status(200).json({ success: true, data });
  } catch (error) {
    sendError(res, error);
  }
}

async function createVariantRevision(req, res) {
  try {
    const data = await revisions.createVariantRevision(
      req.params.id, req.adminInfo?.id,
      { includeCompanion: req.body?.includeCompanion !== false }
    );
    res.status(201).json({ success: true, message: "Variant revision draft created.", data });
  } catch (error) {
    sendError(res, error);
  }
}

async function updateVariant(req, res) {
  try {
    const data = await variants.updateVariant(
      req.params.id, req.body, req.adminInfo?.id,
      { writeContext: VARIANT_WRITE_CONTEXT.LEGACY_ADMIN_ENDPOINT }
    );
    res.status(200).json({ success: true, message: "Variant updated.", data });
  } catch (error) {
    sendError(res, error);
  }
}

async function deleteVariant(req, res) {
  try {
    await variants.deleteVariant(req.params.id);
    res.status(200).json({ success: true, message: "Variant deleted." });
  } catch (error) {
    sendError(res, error);
  }
}

async function setVariantStops(req, res) {
  try {
    const { stops } = req.body;
    if (!Array.isArray(stops) || stops.length === 0) {
      return res.status(400).json({
        success: false, message: "stops array is required.",
      });
    }
    const data = await sequences.setVariantStops(req.params.variantId, stops, {
      writeContext: VARIANT_WRITE_CONTEXT.LEGACY_ADMIN_ENDPOINT,
    });
    res.status(200).json({
      success: true, message: "Stop sequence saved.", data,
    });
  } catch (error) {
    sendError(res, error);
  }
}

async function getStopsForVariant(req, res) {
  try {
    const data = await sequences.getStopsForVariant(req.params.variantId);
    res.status(200).json({ success: true, results: data.length, data });
  } catch (error) {
    sendError(res, error);
  }
}

async function rollbackVariantRevision(req, res) {
  try {
    const data = await revisions.rollbackVariantRevision(
      req.params.id, req.adminInfo?.id
    );
    res.status(200).json({ success: true, message: "Route rollback successful.", data });
  } catch (error) {
    sendError(res, error);
  }
}

async function deleteHistoricalRevision(req, res) {
  try {
    const data = await revisions.deleteHistoricalRevision(req.params.id);
    res.status(200).json({ success: true, ...data });
  } catch (error) {
    sendError(res, error);
  }
}

module.exports = {
  createVariant, getVariantsByCorridor, updateVariant, deleteVariant,
  getVariantDetails, createVariantRevision, rollbackVariantRevision,
  deleteHistoricalRevision, setVariantStops, getStopsForVariant,
};
