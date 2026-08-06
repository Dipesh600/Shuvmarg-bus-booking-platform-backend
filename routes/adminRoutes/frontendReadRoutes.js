"use strict";

const adminMiddleware = require("../../middleware/adminMiddleware.js");
const busOwnerController = require("../../src/modules/admin/bus-owner-management");
const busOwnerFleetController = require("../../src/modules/admin/fleet-management");
const adminFleetController = require("../../controllers/adminController/busOwnerController/fleetController.js");
const {
  mapLegacyOwnerDetailRequest,
  mapLegacyKycDetailRequest,
  mapLegacyFleetDetailRequest,
  mapLegacyFleetSetupRequest,
} = require("../../src/modules/read-contracts/routes/legacy-read-request.adapter.js");

function registerAdminFrontendReadRoutes(router, options = {}) {
  const auth = options.adminMiddleware || adminMiddleware;
  const ownerCtrl = options.busOwnerController || busOwnerController;
  const fleetCtrl = options.busOwnerFleetController || busOwnerFleetController;

  // ── Admin Bus Owners ────────────────────────────────────────────────────────
  router.get("/bus-owners", auth, ownerCtrl.getAllBusOwners);
  router.get("/bus-owners/:ownerId", auth, ownerCtrl.getBusOwnerById);
  router.get("/getAllBusOwners", auth, ownerCtrl.getAllBusOwners);
  router.post("/getBusOwnerDetails", auth, mapLegacyOwnerDetailRequest, ownerCtrl.getBusOwnerById);

  // ── Admin Bus-Owner KYC ──────────────────────────────────────────────────────
  router.get("/bus-owner-kycs", auth, ownerCtrl.getAllBusOwnerKycs);
  router.get("/bus-owner-kycs/:kycId", auth, ownerCtrl.getBusOwnerKycById);
  router.get("/getAllBusOwnerKycs", auth, ownerCtrl.getAllBusOwnerKycs);
  router.post("/getBusOwnerKycDetails", auth, mapLegacyKycDetailRequest, ownerCtrl.getBusOwnerKycById);

  // ── Admin Fleets ─────────────────────────────────────────────────────────────
  router.get("/fleets", auth, fleetCtrl.getAllFleet);
  router.get("/fleets/:fleetId/setup-status", auth, fleetCtrl.getFleetSetupStatus);
  router.get("/fleets/:fleetId", auth, fleetCtrl.getFleetById);
  router.get("/fleet/getAllFleet", auth, fleetCtrl.getAllFleet);
  router.get("/fleet/:id/setup-status", auth, mapLegacyFleetSetupRequest, fleetCtrl.getFleetSetupStatus);
  router.get("/fleet/getById/:id", auth, mapLegacyFleetDetailRequest, fleetCtrl.getFleetById);

  // LEGACY COMPATIBILITY ROUTE.
  // Do not use for new frontend integrations.
  // Canonical fleet detail:
  // GET /api/admin/fleets/:fleetId
  router.get("/fleet/details/:id", auth, mapLegacyFleetDetailRequest, adminFleetController.getFleetById);

  return router;
}

module.exports = { registerAdminFrontendReadRoutes };
