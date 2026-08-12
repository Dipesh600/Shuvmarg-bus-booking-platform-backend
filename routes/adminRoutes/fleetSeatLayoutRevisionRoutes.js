"use strict";

const controller = require(
  "../../src/modules/admin/fleet-management/fleet-seat-layout-revision.controller"
);

function registerFleetSeatLayoutRevisionRoutes(router, adminMiddleware) {
  router.get("/fleet/seat-layout-revisions", adminMiddleware, controller.listPending);
  router.patch("/fleet/seat-layout-revisions/:revisionId", adminMiddleware, controller.decide);
}

module.exports = { registerFleetSeatLayoutRevisionRoutes };
