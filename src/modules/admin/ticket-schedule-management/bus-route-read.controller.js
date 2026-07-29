"use strict";

const BusRoute = require("../../../../models/busRouteModel");

async function getAllRoutes(req, res) {
  try {
    const routes = await BusRoute.find().sort({ createdAt: -1 });
    return res.status(200).json({
      status: true,
      message: "All routes fetched successfully!",
      results: routes.length,
      data: routes,
    });
  } catch (error) {
    console.error("Error fetching routes:", error);
    return res.status(500).json({
      status: false, message: "Internal Server Error!",
    });
  }
}

async function getRouteById(req, res) {
  try {
    const route = await BusRoute.findById(req.params.id);
    if (!route) {
      return res.status(404).json({
        status: false, message: "Route not found!",
      });
    }
    return res.status(200).json({
      status: true,
      message: "Route details fetched successfully!",
      data: route,
    });
  } catch (error) {
    console.error("Error fetching route by ID:", error);
    return res.status(500).json({
      status: false, message: "Internal Server Error!",
    });
  }
}

module.exports = { getAllRoutes, getRouteById };
