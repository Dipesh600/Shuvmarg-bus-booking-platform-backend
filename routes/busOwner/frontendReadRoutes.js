"use strict";

const busOwnerKyc = require("../../src/modules/bus-owner/kyc-submission");
const { createBusOwnerReadService } = require("../../src/modules/read-contracts/bus-owner/bus-owner-read.service");
const { mapReadError } = require("../../src/modules/read-contracts/common/read-error.mapper");
const { registerBusOwnerApprovedFleetRoutes } = require("./frontendFleetRoutes.js");

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
  return registerBusOwnerApprovedFleetRoutes(router, options);
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
  registerBusOwnerApprovedFleetRoutes,
  getProfileHandler,
};
