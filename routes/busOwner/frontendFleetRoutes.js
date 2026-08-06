"use strict";

const requireApprovedBusOwner = require("../../middleware/requireApprovedBusOwner.js");
const fleetManagement = require("../../src/modules/bus-owner/fleet-management");
const {
  mapLegacyFleetUpdateRequest,
  mapLegacyFleetDeleteRequest,
} = require("../../src/modules/bus-owner/fleet-management/legacy-fleet-write-request.adapter.js");
const {
  mapLegacyFleetDetailRequest,
} = require("../../src/modules/read-contracts/routes/legacy-read-request.adapter.js");

function registerBusOwnerApprovedFleetRoutes(router, options = {}) {
  const fleetCtrl = options.fleetManagement || fleetManagement;
  const approvedMiddleware = options.requireApprovedBusOwner !== undefined
    ? options.requireApprovedBusOwner
    : requireApprovedBusOwner;

  const createHandler = fleetCtrl.createFleet || fleetCtrl.submitFleetForVerification;

  if (approvedMiddleware) {
    router.get("/fleets", approvedMiddleware, fleetCtrl.getMyFleets);
    router.post("/fleets", approvedMiddleware, createHandler);
    router.get("/fleets/:fleetId", approvedMiddleware, fleetCtrl.getFleetById);
    router.patch("/fleets/:fleetId", approvedMiddleware, fleetCtrl.updateFleet);
    router.delete("/fleets/:fleetId", approvedMiddleware, fleetCtrl.deleteFleet);

    router.get("/myFleets", approvedMiddleware, fleetCtrl.getMyFleets);
    router.post("/getFleetById", approvedMiddleware, mapLegacyFleetDetailRequest, fleetCtrl.getFleetById);

    router.post("/submitFleetForVerification", approvedMiddleware, createHandler);
    router.patch("/updateFleet", approvedMiddleware, mapLegacyFleetUpdateRequest, fleetCtrl.updateFleet);
    router.delete("/deleteFleet", approvedMiddleware, mapLegacyFleetDeleteRequest, fleetCtrl.deleteFleet);
  } else {
    router.get("/fleets", fleetCtrl.getMyFleets);
    router.post("/fleets", createHandler);
    router.get("/fleets/:fleetId", fleetCtrl.getFleetById);
    router.patch("/fleets/:fleetId", fleetCtrl.updateFleet);
    router.delete("/fleets/:fleetId", fleetCtrl.deleteFleet);

    router.get("/myFleets", fleetCtrl.getMyFleets);
    router.post("/getFleetById", mapLegacyFleetDetailRequest, fleetCtrl.getFleetById);

    router.post("/submitFleetForVerification", createHandler);
    router.patch("/updateFleet", mapLegacyFleetUpdateRequest, fleetCtrl.updateFleet);
    router.delete("/deleteFleet", mapLegacyFleetDeleteRequest, fleetCtrl.deleteFleet);
  }

  return router;
}

module.exports = {
  registerBusOwnerApprovedFleetRoutes,
};
