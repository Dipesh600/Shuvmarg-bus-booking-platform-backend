"use strict";

const points = require("./registry-boarding-point.service.js");

async function createBoardingPoint(req, res) {
  try {
    const data = await points.createBoardingPoint(req.body);
    res.status(201).json({
      success: true, message: "Boarding point registered.", data,
    });
  } catch (error) {
    const status = error.message.includes("not found") ? 404 : 400;
    res.status(status).json({ success: false, message: error.message });
  }
}

async function getBoardingPointsByStop(req, res) {
  try {
    const data = await points.getBoardingPointsByStop(req.params.stopCode);
    res.status(200).json({ success: true, results: data.length, data });
  } catch (error) {
    const status = error.message.includes("not found") ? 404 : 500;
    res.status(status).json({ success: false, message: error.message });
  }
}

async function updateBoardingPoint(req, res) {
  try {
    const data = await points.updateBoardingPoint(req.params.id, req.body);
    res.status(200).json({
      success: true, message: "Boarding point updated.", data,
    });
  } catch (error) {
    const status = error.message.includes("not found") ? 404 : 400;
    res.status(status).json({ success: false, message: error.message });
  }
}

async function deleteRegistryBoardingPoint(req, res) {
  try {
    await points.deleteRegistryBoardingPoint(req.params.id);
    res.status(200).json({
      success: true, message: "Boarding point deleted.",
    });
  } catch (error) {
    const status = error.message.includes("not found") ? 404 : 400;
    res.status(status).json({ success: false, message: error.message });
  }
}

module.exports = {
  createBoardingPoint, getBoardingPointsByStop,
  updateBoardingPoint, deleteRegistryBoardingPoint,
};
