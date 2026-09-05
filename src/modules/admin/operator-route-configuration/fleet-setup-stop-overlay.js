"use strict";

const FleetRouteSetup = require("../../../../models/fleetRouteSetupModel.js");

function idOf(value) {
  if (!value) return null;
  return String(value._id || value.id || value);
}

function idsOf(values = []) {
  return values.map(idOf).filter(Boolean);
}

function normalizeCatalogOptions(value) {
  if (!value || typeof value !== "object") {
    return { configId: value || null, fleetId: null };
  }
  return {
    configId: value.configId || null,
    fleetId: value.fleetId || null,
  };
}

async function getFleetSetupActiveStopIds({ fleetId, variantId }) {
  if (!fleetId) return [];
  const setup = await FleetRouteSetup.findOne({ fleetId, variantId })
    .select("servedStops.stopId")
    .lean();
  return idsOf((setup?.servedStops || []).map((stop) => stop.stopId));
}

function getConfigActiveStopIds(config) {
  return idsOf(config?.activeStops || []);
}

function isStopActiveFromOverlay(stopId, { config, configActiveIds, fleetSetupActiveIds }) {
  if (config) return configActiveIds.includes(stopId);
  if (fleetSetupActiveIds.length) return fleetSetupActiveIds.includes(stopId);
  return false;
}

module.exports = {
  getConfigActiveStopIds,
  getFleetSetupActiveStopIds,
  isStopActiveFromOverlay,
  normalizeCatalogOptions,
};
