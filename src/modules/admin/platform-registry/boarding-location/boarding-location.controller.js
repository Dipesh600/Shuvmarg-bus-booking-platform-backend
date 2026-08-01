"use strict";

const service = require("./boarding-location.service.js");

function handleError(res, error) {
  const status = error.statusCode || (error.name === "ValidationError" ? 400 : 500);
  const message = status === 500
    ? "The boarding location request could not be completed."
    : error.message;
  return res.status(status).json({
    success: false,
    code: error.code || (status === 500 ? "BOARDING_LOCATION_ERROR" : "VALIDATION_ERROR"),
    message,
    details: error.details,
  });
}

async function createBoardingLocation(req, res) {
  try {
    const data = await service.createBoardingLocation(
      req.body, req.adminInfo?.id || req.admin?._id
    );
    return res.status(201).json({
      success: true, message: "Boarding location created.", data,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

async function listBoardingLocations(req, res) {
  try {
    const data = await service.listBoardingLocations(req.query);
    return res.status(200).json({ success: true, results: data.length, data });
  } catch (error) {
    return handleError(res, error);
  }
}

async function getBoardingLocation(req, res) {
  try {
    const data = await service.getBoardingLocation(req.params.id);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return handleError(res, error);
  }
}

async function getNearbyBoardingLocations(req, res) {
  try {
    const data = await service.getNearbyLocations({
      ...req.query,
      coordinates: { lat: req.query.lat, lng: req.query.lng },
    });
    return res.status(200).json({ success: true, results: data.length, data });
  } catch (error) {
    return handleError(res, error);
  }
}

async function updateBoardingLocation(req, res) {
  try {
    const data = await service.updateBoardingLocation(req.params.id, req.body);
    return res.status(200).json({
      success: true, message: "Boarding location updated.", data,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

async function deactivateBoardingLocation(req, res) {
  try {
    const data = await service.deactivateBoardingLocation(req.params.id);
    return res.status(200).json({
      success: true, message: "Boarding location deactivated.", data,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

module.exports = {
  createBoardingLocation, listBoardingLocations, getBoardingLocation,
  getNearbyBoardingLocations, updateBoardingLocation,
  deactivateBoardingLocation,
};
