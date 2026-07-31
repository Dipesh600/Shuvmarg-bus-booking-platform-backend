"use strict";

const stops = require("./stop-registry.service.js");
const bulk = require("./stop-bulk-import.service.js");

async function createStop(req, res) {
  try {
    const data = await stops.createStop(req.body, req.adminInfo?.id);
    res.status(201).json({
      success: true, message: "Stop added to registry.", data,
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false, message: error.message, code: error.code, details: error.details
      });
    }
    if (error.name === 'ValidationError') {
      return res.status(400).json({ success: false, message: error.message, code: "VALIDATION_ERROR" });
    }
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: "A stop with this identity already exists.", code: "DUPLICATE_ERROR" });
    }
    res.status(500).json({ success: false, message: error.message });
  }
}

async function getAllStops(req, res) {
  try {
    const filter = {};
    const { isSearchable, isRouteStop, parentStopId, status, verificationStatus, source, type, district, municipality } = req.query;

    if (isSearchable !== undefined) filter.isSearchable = isSearchable === "true";
    if (isRouteStop !== undefined) filter.isRouteStop = isRouteStop === "true";
    if (parentStopId !== undefined) {
      filter.parentStopId = parentStopId === "null" ? null : parentStopId;
    }
    if (status) filter.status = status;
    if (verificationStatus) filter.verificationStatus = verificationStatus;
    if (source) filter.source = source;
    if (type) filter.type = type;
    if (district) filter.district = district;
    if (municipality) filter.municipality = municipality;

    const data = await stops.getAllStops(filter);
    res.status(200).json({ success: true, results: data.length, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}

async function searchStops(req, res) {
  try {
    const { q } = req.query;
    if (!q) {
      return res.status(400).json({
        success: false, message: "Query parameter 'q' is required.",
      });
    }
    const data = await stops.searchStops(q);
    res.status(200).json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}

async function previewBulkImportStops(req, res) {
  try {
    if (!Array.isArray(req.body)) {
      return res.status(400).json({
        success: false,
        message: "Request body must be a JSON array of stop objects.",
      });
    }
    const data = await bulk.bulkPreviewStops(req.body);
    res.status(200).json({ success: true, data });
  } catch (error) {
    const invalid = ["too large", "empty", "array"].some((term) =>
      error.message.includes(term)
    );
    res.status(invalid ? 400 : 500).json({
      success: false, message: error.message,
    });
  }
}

async function bulkImportStops(req, res) {
  try {
    if (!Array.isArray(req.body)) {
      return res.status(400).json({
        success: false,
        message: "Request body must be a JSON array of stop objects.",
      });
    }
    const data = await bulk.bulkImportStops(req.body, req.adminInfo?.id);
    res.status(200).json({
      success: true,
      message: `Import complete. ${data.inserted} stop(s) added, ${data.skipped} skipped.`,
      data,
    });
  } catch (error) {
    const invalid = ["too large", "empty", "array"].some((term) =>
      error.message.includes(term)
    );
    res.status(invalid ? 400 : 500).json({
      success: false, message: error.message,
    });
  }
}

async function updateStop(req, res) {
  try {
    const data = await stops.updateStop(req.params.id, req.body);
    res.status(200).json({ success: true, message: "Stop updated.", data });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false, message: error.message, code: error.code, details: error.details
      });
    }
    if (error.name === 'ValidationError') {
      return res.status(400).json({ success: false, message: error.message, code: "VALIDATION_ERROR" });
    }
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: "A stop with this identity already exists.", code: "DUPLICATE_ERROR" });
    }
    res.status(500).json({ success: false, message: error.message });
  }
}

async function deleteStop(req, res) {
  try {
    await stops.deleteStop(req.params.id);
    res.status(200).json({
      success: true, message: "Stop deleted from registry.",
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false, message: error.message, code: error.code, details: error.details
      });
    }
    res.status(500).json({ success: false, message: error.message });
  }
}

module.exports = {
  createStop, getAllStops, searchStops, previewBulkImportStops,
  bulkImportStops, updateStop, deleteStop,
};
