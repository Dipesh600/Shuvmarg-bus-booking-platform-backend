"use strict";

const configuration = require("./configuration.service.js");
const catalog = require("./variant-catalog.service.js");
const brandRoutes = require("./brand-route-services.service.js");
const Bus = require("../../../../models/fleetModel.js");

async function getFleetScope(brandId, fleetId) {
  if (!fleetId) return null;
  const fleet = await Bus.findOne({ _id: fleetId, brandId })
    .select("corridorId approvalStatus")
    .lean();
  if (!fleet) {
    const error = new Error("The selected bus does not belong to this operator brand.");
    error.statusCode = 404;
    throw error;
  }
  if (fleet.approvalStatus !== "APPROVED") {
    const error = new Error("Stops and timings can only be configured for an approved bus.");
    error.statusCode = 409;
    throw error;
  }
  if (!fleet.corridorId) {
    const error = new Error("Assign an approved route to this bus first.");
    error.statusCode = 409;
    throw error;
  }
  return fleet;
}

async function getAvailableVariants(req, res) {
  try {
    const fleet = await getFleetScope(req.query.brandId, req.query.fleetId);
    const data = await catalog.getAvailableVariantsForOperator(
      req.query.brandId,
      {
        fleetId: req.query.fleetId || null,
        corridorIds: fleet
          ? [fleet.corridorId]
          : req.query.corridorId ? [req.query.corridorId] : null,
      }
    );
    res.status(200).json({ success: true, results: data.length, data });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
}

async function getOperatorConfigs(req, res) {
  try {
    await getFleetScope(req.params.brandId, req.query.fleetId);
    const data = await configuration.getOperatorConfigs(req.params.brandId, {
      statuses: req.query.fleetId ? ["ACTIVE", "DRAFT"] : ["ACTIVE"],
      fleetId: req.query.fleetId || null,
    });
    res.status(200).json({ success: true, results: data.length, data });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
}

async function getVariantStopsWithConfig(req, res) {
  try {
    const { brandId, variantId } = req.params;
    await getFleetScope(brandId, req.query.fleetId);
    const data = await catalog.getVariantStopsWithConfig(
      variantId, brandId, {
        configId: req.query.configId || null,
        fleetId: req.query.fleetId || null,
      }
    );
    res.status(200).json({ success: true, results: data.length, data });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
}

async function getReturnVariantStops(req, res) {
  try {
    const { brandId, variantId } = req.params;
    await getFleetScope(brandId, req.query.fleetId);
    const data = await catalog.getReturnVariantStops(
      variantId, brandId, {
        configId: req.query.configId || null,
        fleetId: req.query.fleetId || null,
      }
    );
    res.status(200).json({ success: true, data });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
}

async function listPatternsForVariant(req, res) {
  try {
    const { brandId, variantId } = req.params;
    const data = await configuration.listPatternsForVariant(
      brandId, variantId
    );
    res.status(200).json({ success: true, results: data.length, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}

async function getBrandRouteServices(req, res) {
  try {
    const result = await brandRoutes.getBrandRouteServices(req.params.brandId);
    res.status(200).json({
      success: true, results: result.data.length,
      data: result.data, summary: result.summary,
    });
  } catch (error) {
    console.error("getBrandRouteServices error:", error);
    res.status(500).json({
      success: false, message: "Internal Server Error",
    });
  }
}

module.exports = {
  getAvailableVariants, getOperatorConfigs, getVariantStopsWithConfig,
  getReturnVariantStops, listPatternsForVariant, getBrandRouteServices,
};
