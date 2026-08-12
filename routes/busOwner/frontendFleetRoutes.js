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

  // Draft-safe fleet endpoints (accessible to any authenticated bus owner)
  router.get("/fleets", fleetCtrl.getMyFleets);
  router.post("/fleets", fleetCtrl.createFleet);
  router.get("/fleets/:fleetId", fleetCtrl.getFleetById);
  router.patch("/fleets/:fleetId", fleetCtrl.updateFleet);
  router.post("/fleets/:fleetId/seat-layout-revisions", fleetCtrl.requestSeatLayoutRevision);
  router.get("/fleets/:fleetId/seat-layout-revisions", fleetCtrl.listSeatLayoutRevisions);
  router.delete("/fleets/:fleetId", fleetCtrl.deleteFleet);

  router.get("/myFleets", fleetCtrl.getMyFleets);
  router.post("/getFleetById", mapLegacyFleetDetailRequest, fleetCtrl.getFleetById);
  router.patch("/updateFleet", mapLegacyFleetUpdateRequest, fleetCtrl.updateFleet);
  router.delete("/deleteFleet", mapLegacyFleetDeleteRequest, fleetCtrl.deleteFleet);

  // Approval-required fleet submission endpoints
  const submitHandler = fleetCtrl.submitFleetForVerification || fleetCtrl.createFleet;
  if (approvedMiddleware) {
    router.post("/fleets/:fleetId/submit", approvedMiddleware, submitHandler);
    router.post("/submitFleetForVerification", approvedMiddleware, submitHandler);
  } else {
    router.post("/fleets/:fleetId/submit", submitHandler);
    router.post("/submitFleetForVerification", submitHandler);
  }

  return router;
}

module.exports = {
  registerBusOwnerApprovedFleetRoutes,
};
