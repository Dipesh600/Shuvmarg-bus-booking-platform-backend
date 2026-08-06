"use strict";

const requireApprovedBusOwner = require("../../middleware/requireApprovedBusOwner.js");
const busOwnerKyc = require("../../src/modules/bus-owner/kyc-submission");
const fleetManagement = require("../../src/modules/bus-owner/fleet-management");
const { createBusOwnerReadService } = require("../../src/modules/read-contracts/bus-owner/bus-owner-read.service");
const { mapReadError } = require("../../src/modules/read-contracts/common/read-error.mapper");
const { mapLegacyFleetDetailRequest } = require("../../src/modules/read-contracts/routes/legacy-read-request.adapter.js");

const defaultReadService = createBusOwnerReadService();

async function getProfileHandler(req, res) {
  try {
    const result = await defaultReadService.getOwnProfile(req);
    return res.status(200).json(result);
  } catch (error) {
    const { statusCode, payload } = mapReadError(error);
    return res.status(statusCode).json(payload);
  }
}

function registerBusOwnerUnapprovedReadRoutes(router, options = {}) {
  const kycCtrl = options.busOwnerKyc || busOwnerKyc;
  const getProfile = options.getProfile || getProfileHandler;

  router.get("/profile", getProfile);
  router.get("/kyc-status", kycCtrl.getMyBusOwnerKycStatus);
  router.get("/myBusOwnerKycStatus", kycCtrl.getMyBusOwnerKycStatus);

  return router;
}

function registerBusOwnerApprovedReadRoutes(router, options = {}) {
  const fleetCtrl = options.fleetManagement || fleetManagement;
  const approvedMiddleware = options.requireApprovedBusOwner !== undefined
    ? options.requireApprovedBusOwner
    : requireApprovedBusOwner;

  if (approvedMiddleware) {
    router.get("/fleets", approvedMiddleware, fleetCtrl.getMyFleets);
    router.get("/fleets/:fleetId", approvedMiddleware, fleetCtrl.getFleetById);
    router.get("/myFleets", approvedMiddleware, fleetCtrl.getMyFleets);
    router.post("/getFleetById", approvedMiddleware, mapLegacyFleetDetailRequest, fleetCtrl.getFleetById);
  } else {
    router.get("/fleets", fleetCtrl.getMyFleets);
    router.get("/fleets/:fleetId", fleetCtrl.getFleetById);
    router.get("/myFleets", fleetCtrl.getMyFleets);
    router.post("/getFleetById", mapLegacyFleetDetailRequest, fleetCtrl.getFleetById);
  }

  return router;
}

function registerBusOwnerFrontendReadRoutes(router, options = {}) {
  registerBusOwnerUnapprovedReadRoutes(router, options);
  registerBusOwnerApprovedReadRoutes(router, options);
  return router;
}

module.exports = {
  registerBusOwnerFrontendReadRoutes,
  registerBusOwnerUnapprovedReadRoutes,
  registerBusOwnerApprovedReadRoutes,
  getProfileHandler,
};
