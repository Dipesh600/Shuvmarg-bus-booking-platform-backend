"use strict";

function mapLegacyFleetUpdateRequest(req, _res, next) {
  const fleetId = req.params?.fleetId || req.body?.fleetId || req.body?.id;
  if (fleetId) {
    req.params = { ...req.params, fleetId };
  }
  next();
}

function mapLegacyFleetDeleteRequest(req, _res, next) {
  const fleetId = req.params?.fleetId || req.body?.fleetId || req.body?.id;
  if (fleetId) {
    req.params = { ...req.params, fleetId };
  }
  next();
}

module.exports = {
  mapLegacyFleetUpdateRequest,
  mapLegacyFleetDeleteRequest,
};
