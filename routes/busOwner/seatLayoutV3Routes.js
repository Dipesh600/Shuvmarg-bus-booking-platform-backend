"use strict";

const { busOwnerSeatLayoutController } = require("../../src/modules/seat-layout-v3-persistence");

function registerBusOwnerSeatLayoutV3Routes(router, controller = busOwnerSeatLayoutController) {
  router.get("/seat-layout-v3/catalog", controller.listCatalog);
  router.get("/seat-layout-v3/templates", controller.listMyTemplates);
  router.get("/seat-layout-v3/templates/:templateId", controller.getTemplate);
  router.post("/seat-layout-v3/catalog/:templateId/adopt", controller.adoptPlatformTemplate);
  router.post("/seat-layout-v3/templates/:templateId/revisions", controller.createRevision);
  router.post(
    "/seat-layout-v3/templates/:templateId/revisions/:revisionId/submit", controller.submitRevision
  );
  router.get("/seat-layout-v3/fleets/:fleetId/assignment", controller.getFleetAssignment);
  router.post("/seat-layout-v3/fleets/:fleetId/assignment", controller.assignInitial);
  router.post("/seat-layout-v3/fleets/:fleetId/change-requests", controller.requestChange);
}

module.exports = { registerBusOwnerSeatLayoutV3Routes };
