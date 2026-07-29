"use strict";

const variants = require("./route-variant-registry.service.js");
const sequences = require("./route-stop-sequence.service.js");

async function createVariant(req, res) {
  try {
    const data = await variants.createVariant(req.body, req.user?.id);
    res.status(201).json({
      success: true, message: "Route variant created.", data,
    });
  } catch (error) {
    const status = error.message.includes("not found") ? 404 : 400;
    res.status(status).json({ success: false, message: error.message });
  }
}

async function getVariantsByCorridor(req, res) {
  try {
    const data = await variants.getVariantsByCorridor(req.params.corridorId);
    res.status(200).json({ success: true, results: data.length, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}

async function updateVariant(req, res) {
  try {
    const data = await variants.updateVariant(req.params.id, req.body);
    res.status(200).json({ success: true, message: "Variant updated.", data });
  } catch (error) {
    const status = error.message.includes("not found") ? 404 : 400;
    res.status(status).json({ success: false, message: error.message });
  }
}

async function deleteVariant(req, res) {
  try {
    await variants.deleteVariant(req.params.id);
    res.status(200).json({ success: true, message: "Variant deleted." });
  } catch (error) {
    if (error.message.startsWith("REFERENCED:")) {
      const [, count, message] = error.message.split(":");
      return res.status(409).json({
        success: false, message, refCount: Number(count),
      });
    }
    const status = error.message.includes("not found") ? 404 : 400;
    res.status(status).json({ success: false, message: error.message });
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
    const data = await sequences.setVariantStops(req.params.variantId, stops);
    res.status(200).json({
      success: true, message: "Stop sequence saved.", data,
    });
  } catch (error) {
    const status = error.message.includes("not found") ? 404 : 400;
    res.status(status).json({ success: false, message: error.message });
  }
}

async function getStopsForVariant(req, res) {
  try {
    const data = await sequences.getStopsForVariant(req.params.variantId);
    res.status(200).json({ success: true, results: data.length, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}

module.exports = {
  createVariant, getVariantsByCorridor, updateVariant, deleteVariant,
  setVariantStops, getStopsForVariant,
};
