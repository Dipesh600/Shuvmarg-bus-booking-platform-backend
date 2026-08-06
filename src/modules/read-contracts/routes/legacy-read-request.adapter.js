"use strict";

function createLegacyDetailAdapter(paramName, getSourceValue) {
  return function legacyDetailAdapter(req, _res, next) {
    req.params = req.params || {};
    const value = getSourceValue(req);
    if (value !== undefined && value !== null) {
      req.params[paramName] = value;
    }
    next();
  };
}

const mapLegacyOwnerDetailRequest = createLegacyDetailAdapter("ownerId", (req) => (
  req.body?.ownerId ?? req.body?.id ?? req.params?.id
));

const mapLegacyKycDetailRequest = createLegacyDetailAdapter("kycId", (req) => (
  req.body?.kycId ?? req.body?.id ?? req.params?.id
));

const mapLegacyFleetDetailRequest = createLegacyDetailAdapter("fleetId", (req) => (
  req.params?.id ?? req.body?.fleetId ?? req.body?.id
));

const mapLegacyFleetSetupRequest = createLegacyDetailAdapter("fleetId", (req) => (
  req.params?.id
));

module.exports = {
  createLegacyDetailAdapter,
  mapLegacyOwnerDetailRequest,
  mapLegacyKycDetailRequest,
  mapLegacyFleetDetailRequest,
  mapLegacyFleetSetupRequest,
};
