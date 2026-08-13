"use strict";

const { adminSeatLayoutController } = require("../../src/modules/seat-layout-v3-persistence");
const {
  rejectOversizedSeatLayoutRequest, seatLayoutCreationRateLimiter,
} = require("../../middleware/seatLayoutCreationProtection");

const creationGuards = [seatLayoutCreationRateLimiter, rejectOversizedSeatLayoutRequest];

function registerAdminSeatLayoutV3Routes(router, adminMiddleware, controller = adminSeatLayoutController) {
  router.get("/seat-layout-v3/templates", adminMiddleware, controller.listTemplates);
  router.post("/seat-layout-v3/templates", adminMiddleware, ...creationGuards, controller.createPlatformTemplate);
  router.get("/seat-layout-v3/templates/:templateId", adminMiddleware, controller.getTemplate);
  router.post("/seat-layout-v3/templates/:templateId/adopt", adminMiddleware, ...creationGuards, controller.adoptForOperator);
  router.post("/seat-layout-v3/templates/:templateId/revisions", adminMiddleware, ...creationGuards, controller.createRevision);
  router.post(
    "/seat-layout-v3/templates/:templateId/revisions/:revisionId/submit",
    adminMiddleware, controller.submitRevision
  );
  router.post(
    "/seat-layout-v3/templates/:templateId/revisions/:revisionId/publish",
    adminMiddleware, controller.publishRevision
  );
  router.get("/seat-layout-v3/fleets/:fleetId/assignment", adminMiddleware, controller.getFleetAssignment);
  router.post("/seat-layout-v3/fleets/:fleetId/assignment", adminMiddleware, controller.assignInitial);
  router.get("/seat-layout-v3/change-requests", adminMiddleware, controller.listChangeRequests);
  router.post(
    "/seat-layout-v3/change-requests/:requestId/approve", adminMiddleware, controller.approveChange
  );
  router.post(
    "/seat-layout-v3/change-requests/:requestId/reject", adminMiddleware, controller.rejectChange
  );
}

module.exports = { registerAdminSeatLayoutV3Routes };
