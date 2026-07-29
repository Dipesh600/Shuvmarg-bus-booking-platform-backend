"use strict";

const corridors = require("./corridor-registry.service.js");

async function createCorridor(req, res) {
  try {
    const data = await corridors.createCorridor(req.body, req.user?.id);
    res.status(201).json({
      success: true, message: "Corridor registered.", data,
    });
  } catch (error) {
    const status = error.message.includes("already exists")
      ? 409 : error.message.includes("not found") ? 404 : 400;
    res.status(status).json({ success: false, message: error.message });
  }
}

async function getAllCorridors(req, res) {
  try {
    const data = await corridors.getAllCorridors();
    res.status(200).json({ success: true, results: data.length, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}

async function updateCorridor(req, res) {
  try {
    const data = await corridors.updateCorridor(req.params.id, req.body);
    res.status(200).json({ success: true, message: "Corridor updated.", data });
  } catch (error) {
    const status = error.message.includes("not found") ? 404 : 400;
    res.status(status).json({ success: false, message: error.message });
  }
}

async function deleteCorridor(req, res) {
  try {
    await corridors.deleteCorridor(req.params.id);
    res.status(200).json({ success: true, message: "Corridor deleted." });
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

module.exports = {
  createCorridor, getAllCorridors, updateCorridor, deleteCorridor,
};
