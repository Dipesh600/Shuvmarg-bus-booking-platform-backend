"use strict";

const {
  busOwnerSeatLayoutController, tripSeatLayoutControlController,
} = require("../../src/modules/seat-layout-v3-persistence");
const {
  rejectOversizedSeatLayoutRequest, seatLayoutCreationRateLimiter,
} = require("../../middleware/seatLayoutCreationProtection");

const creationGuards = [seatLayoutCreationRateLimiter, rejectOversizedSeatLayoutRequest];

function registerBusOwnerSeatLayoutV3Routes(router, controller = busOwnerSeatLayoutController) {
  router.get("/seat-layout-v3/catalog", controller.listCatalog);
  router.get("/seat-layout-v3/templates", controller.listMyTemplates);
  router.get("/seat-layout-v3/templates/:templateId", controller.getTemplate);
  router.post("/seat-layout-v3/catalog/:templateId/adopt", ...creationGuards, controller.adoptPlatformTemplate);
  router.post("/seat-layout-v3/templates/:templateId/revisions", ...creationGuards, controller.createRevision);
  router.post(
    "/seat-layout-v3/templates/:templateId/revisions/:revisionId/submit", controller.submitRevision
  );
  router.get("/seat-layout-v3/fleets/:fleetId/assignment", controller.getFleetAssignment);
  router.post("/seat-layout-v3/fleets/:fleetId/assignment", controller.assignInitial);
  router.post("/seat-layout-v3/fleets/:fleetId/initial-custom-layout", ...creationGuards, controller.createInitialCustomLayout);
  router.post("/seat-layout-v3/fleets/:fleetId/change-requests", controller.requestChange);
  router.patch("/seat-layout-v3/fleets/:fleetId/correction", controller.correctRejectedLayout);
}

module.exports = { registerBusOwnerSeatLayoutV3Routes };

function registerBusOwnerSeatLayoutV3OperationalRoutes(router, controller = tripSeatLayoutControlController) {
  router.get("/seat-layout-v3/trips/:tripId", controller.get);
  router.patch("/seat-layout-v3/trips/:tripId/places/:elementId/state", controller.changePlaceState);
  router.patch("/seat-layout-v3/trips/:tripId/pricing", controller.changePricing);
}

module.exports.registerBusOwnerSeatLayoutV3OperationalRoutes = registerBusOwnerSeatLayoutV3OperationalRoutes;
