"use strict";

const {
  createDiscoverySession,
} = require("./route-discovery-session.service.js");
const {
  listDiscoverySessions,
  getDiscoverySession,
} = require("./route-discovery-query.service.js");
const {
  selectRouteOption,
  setRouteOptions: updateRouteOptions,
} = require("./route-selection.service.js");

const createSession = async (req, res) => {
  try {
    const session = await createDiscoverySession(
      req.body,
      req.adminInfo?.id
    );
    res.status(201).json({
      success: true,
      message: "Discovery session created.",
      data: session,
    });
  } catch (error) {
    const status = error.message.includes("not found")
      ? 404
      : error.message.includes("already exists")
        ? 409
        : 400;
    res.status(status).json({ success: false, message: error.message });
  }
};

const listSessions = async (req, res) => {
  try {
    const result = await listDiscoverySessions(req.query);
    res.status(200).json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getSession = async (req, res) => {
  try {
    const session = await getDiscoverySession(req.params.id);
    res.status(200).json({ success: true, data: session });
  } catch (error) {
    res
      .status(error.message.includes("not found") ? 404 : 500)
      .json({ success: false, message: error.message });
  }
};

const selectRoute = async (req, res) => {
  try {
    const {
      routeOptionIndex,
      summary,
      distanceKm,
      durationMins,
      provider,
      encodedPolyline,
      stepPolylines,
    } = req.body;
    const metadata = summary
      ? {
          summary,
          distanceKm,
          durationMins,
          provider,
          encodedPolyline,
          stepPolylines,
        }
      : {};
    const session = await selectRouteOption(
      req.params.id,
      routeOptionIndex ?? 0,
      req.adminInfo?.id,
      metadata
    );
    res.status(200).json({
      success: true,
      message: "Route option selected.",
      data: session,
    });
  } catch (error) {
    res
      .status(error.message.includes("not found") ? 404 : 400)
      .json({ success: false, message: error.message });
  }
};

const setRouteOptions = async (req, res) => {
  try {
    const session = await updateRouteOptions(
      req.params.id,
      req.body.routeOptions
    );
    res.status(200).json({
      success: true,
      message: "Route options updated.",
      data: session,
    });
  } catch (error) {
    res
      .status(error.message.includes("not found") ? 404 : 400)
      .json({ success: false, message: error.message });
  }
};

module.exports = {
  createSession,
  listSessions,
  getSession,
  selectRoute,
  setRouteOptions,
};
