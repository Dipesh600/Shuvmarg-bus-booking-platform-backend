"use strict";

const corridors = require("./corridor-registry.service.js");

function actorId(req) {
  return req.adminInfo?.id || req.admin?._id || req.user?.id || null;
}

function handleError(res, error) {
  const status = error.statusCode || (error.name === "ValidationError" ? 400 : 500);
  return res.status(status).json({
    success: false,
    code: error.code || (status === 500 ? "CORRIDOR_ERROR" : "VALIDATION_ERROR"),
    message: status === 500
      ? "The corridor request could not be completed." : error.message,
    details: error.details,
  });
}

async function createCorridor(req, res) {
  try {
    const data = await corridors.createCorridor(req.body, actorId(req));
    return res.status(201).json({
      success: true, message: "Corridor registered as pending.", data,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

async function getAllCorridors(req, res) {
  try {
    const data = await corridors.getAllCorridors(req.query);
    return res.status(200).json({ success: true, results: data.length, data });
  } catch (error) {
    return handleError(res, error);
  }
}

async function updateCorridor(req, res) {
  try {
    const data = await corridors.updateCorridor(
      req.params.id, req.body, actorId(req)
    );
    return res.status(200).json({
      success: true, message: "Corridor updated.", data,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

async function deleteCorridor(req, res) {
  try {
    await corridors.deleteCorridor(req.params.id);
    return res.status(200).json({ success: true, message: "Corridor deleted." });
  } catch (error) {
    return handleError(res, error);
  }
}

module.exports = {
  createCorridor, deleteCorridor, getAllCorridors, updateCorridor,
};
