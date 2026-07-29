"use strict";

const BusRoute = require("../../../../models/busRouteModel");

async function createRoute(req, res) {
  try {
    const {
      routeName, fromCity, toCity, distance, basePrice, userId,
    } = req.body;
    if (
      !routeName || !fromCity || !toCity ||
      !distance || !basePrice || !userId
    ) {
      return res.status(400).json({
        status: false,
        message: "Route name, from city, to city, distance, base price, " +
          "status, and user ID are required!",
      });
    }
    const route = new BusRoute({
      routeName,
      fromCity,
      toCity,
      distance,
      basePrice,
      userId,
      createdBy: userId,
      createdById: req.adminInfo.id,
    });
    await route.save();
    return res.status(201).json({
      status: true, message: "Route created successfully!", data: route,
    });
  } catch (error) {
    console.error("Error creating route:", error);
    return res.status(500).json({
      status: false,
      message: "Internal Server Error!",
      error: error.message,
    });
  }
}

async function updateRoute(req, res) {
  try {
    const route = await BusRoute.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!route) {
      return res.status(404).json({
        status: false, message: "Route not found!",
      });
    }
    return res.status(200).json({
      status: true, message: "Route updated successfully!", data: route,
    });
  } catch (error) {
    console.error("Error updating route:", error);
    return res.status(500).json({
      status: false,
      message: "Internal Server Error!",
      error: error.message,
    });
  }
}

async function deleteRoute(req, res) {
  try {
    const route = await BusRoute.findByIdAndDelete(req.params.id);
    if (!route) {
      return res.status(404).json({
        status: false, message: "Route not found!",
      });
    }
    return res.status(200).json({
      status: true, message: "Route deleted successfully!",
    });
  } catch (error) {
    console.error("Error deleting route:", error);
    return res.status(500).json({
      status: false, message: "Internal Server Error!",
    });
  }
}

async function toggleRouteStatus(req, res) {
  try {
    const route = await BusRoute.findById(req.params.id);
    if (!route) {
      return res.status(404).json({
        status: false, message: "Route not found!",
      });
    }
    route.status = route.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    await route.save();
    return res.status(200).json({
      status: true,
      message: `Route status changed to ${route.status} successfully!`,
      data: route,
    });
  } catch (error) {
    console.error("Error toggling route status:", error);
    return res.status(500).json({
      status: false, message: "Internal Server Error!",
    });
  }
}

module.exports = { createRoute, updateRoute, deleteRoute, toggleRouteStatus };
