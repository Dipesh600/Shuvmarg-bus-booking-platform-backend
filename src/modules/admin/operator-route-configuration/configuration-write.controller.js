"use strict";

const configuration = require("./configuration.service.js");
const lifecycle = require("./config-lifecycle.service.js");

async function upsertOperatorConfig(req, res) {
  try {
    const { brandId } = req.body;
    if (!brandId) {
      return res.status(400).json({
        success: false, message: "brandId is required.",
      });
    }
    const data = await configuration.upsertOperatorConfig(brandId, req.body);
    res.status(200).json({
      success: true,
      message: "Operator route configuration saved.",
      data,
    });
  } catch (error) {
    const status = error.message.includes("not found") ? 404 : 400;
    res.status(status).json({ success: false, message: error.message });
  }
}

async function updateConfig(req, res) {
  try {
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
