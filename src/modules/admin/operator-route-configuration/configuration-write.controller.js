"use strict";

const configuration = require("./configuration.service.js");
const lifecycle = require("./config-lifecycle.service.js");
const Bus = require("../../../../models/fleetModel.js");
const RouteVariant = require("../../../../models/routeVariantModel.js");
const OperatorConfig = require("../../../../models/operatorRouteConfigModel.js");

async function assertFleetScope(brandId, fleetId, variantId) {
  if (!fleetId) return;
  const fleet = await Bus.findOne({ _id: fleetId, brandId })
    .select("approvalStatus corridorId")
    .lean();
  if (!fleet) {
    const error = new Error("The selected bus does not belong to this operator brand.");
    error.statusCode = 404;
    throw error;
  }
  if (fleet.approvalStatus !== "APPROVED" || !fleet.corridorId) {
    const error = new Error("Assign and approve the bus route before configuring stops and timings.");
    error.statusCode = 409;
    throw error;
  }
  const variant = await RouteVariant.findOne({
    _id: variantId,
    corridorId: fleet.corridorId,
    status: "ACTIVE",
    direction: "FORWARD",
  }).select("_id").lean();
  if (!variant) {
    const error = new Error("The selected path does not belong to this bus route.");
    error.statusCode = 409;
    throw error;
  }
}

async function upsertOperatorConfig(req, res) {
  try {
    const { brandId } = req.body;
    if (!brandId) {
      return res.status(400).json({
        success: false, message: "brandId is required.",
      });
    }
    await assertFleetScope(brandId, req.body.fleetId, req.body.variantId);
    const data = await configuration.upsertOperatorConfig(brandId, req.body);
    res.status(200).json({
      success: true,
      message: "Operator route configuration saved.",
      data,
    });
  } catch (error) {
    const status = error.statusCode || (error.message.includes("not found") ? 404 : 400);
    res.status(status).json({ success: false, message: error.message });
  }
}

async function updateConfig(req, res) {
  try {
    if (req.body.fleetId) {
      const config = await OperatorConfig.findById(req.params.configId)
        .select("brandId fleetId variantId")
        .lean();
      if (!config || String(config.fleetId) !== String(req.body.fleetId)) {
        const error = new Error("This route setup does not belong to the selected bus.");
        error.statusCode = 403;
        throw error;
      }
      await assertFleetScope(config.brandId, config.fleetId, config.variantId);
    }
    const data = await lifecycle.updateConfig(req.params.configId, req.body);
    res.status(200).json({
      success: true, message: "Route configuration updated.", data,
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      success: false, message: error.message,
    });
  }
}

async function toggleConfigStatus(req, res) {
  try {
    const data = await lifecycle.toggleConfigStatus(req.params.configId);
    res.status(200).json({
      success: true, message: `Route config is now ${data.status}.`, data,
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      success: false, message: error.message,
    });
  }
}

async function setDefaultPattern(req, res) {
  try {
    const { brandId } = req.body;
    if (!brandId) {
      return res.status(400).json({
        success: false, message: "brandId is required.",
      });
    }
    const data = await lifecycle.setDefaultPattern(
      brandId, req.params.configId
    );
    res.status(200).json({
      success: true, message: "Pattern is now the default.", data,
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
}

async function deleteConfig(req, res) {
  try {
    await lifecycle.deleteConfig(req.params.configId);
    res.status(200).json({
      success: true, message: "Route pattern deleted.",
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      success: false, message: error.message,
    });
  }
}

module.exports = {
  upsertOperatorConfig, updateConfig, toggleConfigStatus,
  setDefaultPattern, deleteConfig,
};
