"use strict";

const configuration = require("./configuration.service.js");
const catalog = require("./variant-catalog.service.js");
const brandRoutes = require("./brand-route-services.service.js");

async function getAvailableVariants(req, res) {
  try {
    const data = await catalog.getAvailableVariantsForOperator(
      req.query.brandId
    );
    res.status(200).json({ success: true, results: data.length, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}

async function getOperatorConfigs(req, res) {
  try {
    const data = await configuration.getOperatorConfigs(req.params.brandId);
    res.status(200).json({ success: true, results: data.length, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}

async function getVariantStopsWithConfig(req, res) {
  try {
    const { brandId, variantId } = req.params;
    const data = await catalog.getVariantStopsWithConfig(
      variantId, brandId, req.query.configId || null
    );
    res.status(200).json({ success: true, results: data.length, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}

async function getReturnVariantStops(req, res) {
  try {
    const { brandId, variantId } = req.params;
    const data = await catalog.getReturnVariantStops(
      variantId, brandId, req.query.configId || null
    );
    res.status(200).json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
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
