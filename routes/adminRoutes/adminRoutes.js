const express = require("express");
const router = express.Router();
const admin = require("../../src/modules/admin/user-management");
const bookings = require("../../controllers/adminController/booking/bookingController.js");
const couponAdminRoutes = require("../../src/modules/coupon/admin");
const autoSeat = require("../../controllers/adminController/seat-controller/adminAutoSeatController.js");
const authController = require("../../controllers/adminController/authController/auth-controller.js");
const { adminEnrollmentLimiter, adminLoginLimiter } = require("../../middleware/adminAuthRateLimit.js");
const adminMiddleware = require("../../middleware/adminMiddleware.js");
const rootAdminMiddleware = require("../../middleware/rootAdminMiddleware.js");
const adminAdministration = require("../../src/modules/admin/auth-security/admin-administration.controller.js");
const dashboard = require("../../controllers/adminController/dashboardController/dashboardController.js");
const userDashboard = require("../../controllers/adminController/dashboardController/userDashboardController.js");
const agentConversion = require("../../src/modules/agent/admin/conversion");
const agentDirectory = require("../../src/modules/agent/admin/directory");
const agentDashboard = require("../../src/modules/agent/admin/dashboard");
const agentSetup = require("../../src/modules/agent/admin/setup");
const agentKycReview = require("../../src/modules/kyc/agent-review");
const busOwnerController = require("../../src/modules/admin/bus-owner-management");
const adminPushnotification = require("../../controllers/adminController/adminPushnotification.js/adminPushnotification.js");
const busOwnerFleetController = require("../../src/modules/admin/fleet-management");
const refundController = require("../../controllers/adminController/refundController/adminRefundController.js");
const refundPolicyController = require("../../controllers/adminController/refundPolicyController/refundPolicycontroller.js");
const kycVerificationController = require("../../controllers/adminController/kycVerificationController/kycVerificationcontroller.js");
const ticketController = require("../../src/modules/admin/ticket-schedule-management");
const amenitiesController = require("../../controllers/adminController/ticket-controller/adminamenitiesController.js");
const boardingPointController = require("../../controllers/adminController/ticket-controller/adminBoardingPoinController.js");
const adminAmenityController = require("../../controllers/adminController/amenity/amenityController.js");
const adminBusRouteController = require("../../controllers/adminController/busOwnerController/busRouteController.js");
const adminFleetController = require("../../controllers/adminController/busOwnerController/fleetController.js");
const { adminFleetDocumentController } = require("../../src/modules/fleet/document-lifecycle");
const adminTemplateController = require("../../controllers/adminController/busOwnerController/templateController.js");
const adminTripController = require("../../controllers/adminController/busOwnerController/tripController.js");
const adminSettlementCon = require("../../controllers/busOwnerController/settlementController.js");
const fareRuleCon = require("../../controllers/busOwnerController/fareRuleController.js");
const commissionController = require("../../controllers/adminController/commissionController/commissionController.js");
const financialController  = require("../../src/modules/admin/financial-overview");
const analyticsController  = require("../../controllers/adminController/analyticsController/analyticsController.js");
const platformRegistry     = require("../../src/modules/admin/platform-registry");
const operatorConfig       = require("../../src/modules/admin/operator-route-configuration");
const operatorBrand        = require("../../controllers/adminController/operatorBrandController.js");
const routeRequestCtrl     = require("../../controllers/adminController/routeRequestController.js");
const scheduleController   = require("../../src/modules/admin/schedule-management");
const tripExceptionCtrl    = require("../../controllers/adminController/tripExceptionController.js");
const brandFinancialCtrl   = require("../../controllers/adminController/brandFinancialController.js");
const driverController     = require("../../controllers/adminController/driverController.js");
const fleetWorkstation     = require("../../src/modules/admin/fleet-workstation");
const tripOverviewCtrl     = require("../../src/modules/admin/trip-overview");
const adminWalletCtrl      = require("../../src/modules/admin/wallet-management");
const transactionCtrl      = require("../../controllers/adminController/transactionController/transactionController.js");
const registryBoardingRoutes = require("./registryBoardingRoutes.js");
const { registerAdminSeatLayoutV3Routes } = require("./seatLayoutV3Routes.js");
const { rejectOversizedKycRequest, parseKycSubmissionUpload } = require("../../middleware/kycSubmissionUpload.js");
// Auth Routes
router.post("/auth/login", adminLoginLimiter, authController.login);
router.post("/auth/bootstrap/mfa/begin", adminEnrollmentLimiter, authController.beginBootstrapMfa);
router.post("/auth/bootstrap/mfa/confirm", adminEnrollmentLimiter, authController.confirmBootstrapMfa);
router.post("/auth/invitations/mfa/begin", adminEnrollmentLimiter, adminAdministration.begin);
router.post("/auth/invitations/mfa/confirm", adminEnrollmentLimiter, adminAdministration.confirm);
router.get("/auth/profile",  adminMiddleware, authController.getAdminProfile);
router.get("/administrators", adminMiddleware, rootAdminMiddleware, adminAdministration.list);
router.post("/administrators/invitations", adminMiddleware, rootAdminMiddleware, adminAdministration.invite);
router.patch("/administrators/:adminId/status", adminMiddleware, rootAdminMiddleware, adminAdministration.updateStatus);
// NOTE: No /auth/refresh route.
// Super Admin sessions are explicit by design — when a token expires, the admin
// must re-authenticate with their credentials. Silent token refresh is a consumer
// app pattern; for a privileged admin panel it is a security liability.

// User Management Routes
router.delete("/deleteAccount", adminMiddleware, admin.deleteAccount);
router.get("/getAllUsers", adminMiddleware, admin.getAllUsers);
router.get("/userDashboard", adminMiddleware, userDashboard.getUserDashboardStats);
router.post("/getuserById", adminMiddleware, admin.getUserById);
router.patch("/resetPassword", adminMiddleware, admin.changeUserPassword);
router.patch("/updateStatus", adminMiddleware, admin.updateUserStatus);
router.get("/users/:id/transactions", adminMiddleware, admin.getUserTransactions);

// Ticket Management Routes
router.get("/getAllTicket", adminMiddleware, ticketController.getAllTickets);
router.post("/auto-seats", adminMiddleware, autoSeat.createAutoSeat);
router.get("/booking/getAllBookings", adminMiddleware, bookings.getAllBookings);
router.get("/booking/stats", adminMiddleware, bookings.getBookingStats);
router.get("/booking/getBookingById/:bookingid", adminMiddleware, bookings.getBookingById);
router.post("/booking/getBookingsByUser", adminMiddleware, bookings.getBookingsByUser);
router.use(couponAdminRoutes);

// Dashboard
router.get("/dashboard", adminMiddleware, dashboard.getDashboardStats);

// User Dashboard
router.get("/userdashboard", adminMiddleware, userDashboard.getUserDashboardStats);

// Agent 
router.post("/getAgentDetails", adminMiddleware, agentDirectory.getAgentsById);
router.get("/getAllAgents", adminMiddleware, agentDirectory.getAllAgents);
router.get("/agentDashboard", adminMiddleware, agentDashboard.getAgentDashboard);
router.post("/makeUserAgent", adminMiddleware, agentConversion.makeUserAgent);

router.patch("/finalizeAgentSetup", adminMiddleware, agentSetup.finalizeAgentSetup);
router.patch("/agentKycStatus", adminMiddleware, agentKycReview.updateAgentKyc);

// Frontend Read Routes & Compatibility Aliases
const { registerAdminFrontendReadRoutes } = require("./frontendReadRoutes.js");
registerAdminFrontendReadRoutes(router);

// Bus Owner Write / Admin Operations
router.post("/busOwner/create", adminMiddleware, rejectOversizedKycRequest, parseKycSubmissionUpload, busOwnerController.createBusOwnerFull);
router.post("/busOwner/reuploadKycDocument", adminMiddleware, rejectOversizedKycRequest, parseKycSubmissionUpload, busOwnerController.reuploadKycDocument);
// router.post("/makeUserBusOwner", adminMiddleware, busOwnerController.makeUserBusOwner);
router.patch("/busOwnerKycStatus", adminMiddleware, busOwnerController.updateBusOwnerKyc);
router.patch("/busOwner/update", adminMiddleware, busOwnerController.updateBusOwnerProfile);
router.get("/busOwnerDashboard", adminMiddleware, busOwnerController.getBusOwnerDashboard);
// KYC document read — returns a short-lived presigned URL for one document file.
// Admin actor is derived from req.adminInfo set by adminMiddleware.
const kycDocumentRead = require("../../src/modules/bus-owner/kyc-document-read");
router.get("/busOwner/kycDocumentReadUrl", adminMiddleware, kycDocumentRead.getKycDocumentReadUrl);
router.get("/busOwner/kycDocumentView", adminMiddleware, kycDocumentRead.viewKycDocument);

// Push Notification (Admin)
router.post(
  "/push/sendAll",
  adminMiddleware,
  adminPushnotification.sendAllUserToPushnotification
);
router.post(
  "/push/sendOne",
  adminMiddleware,
  adminPushnotification.sendSingleUserToPushnotification
);
// Bus Owner Fleet Operations
router.patch("/fleet/update-status",    adminMiddleware, busOwnerFleetController.updateFleetStatus);
router.get('/fleet/fleetDashboard',     adminMiddleware, busOwnerFleetController.getFleetDashboard);

// Fleet Profile Workstation — full operational dashboard for a single bus
router.get("/fleet/:id/workstation",                      adminMiddleware, fleetWorkstation.getFleetWorkstation);
router.get("/fleet/:fleetId/trips/:tripId/manifest",      adminMiddleware, fleetWorkstation.getTripManifest);
router.patch("/fleet/:fleetId/trips/:tripId/status",      adminMiddleware, fleetWorkstation.updateTripStatus);
router.patch("/fleet/:fleetId/trips/:tripId/driver",      adminMiddleware, fleetWorkstation.reassignTripDriver);

// Refund Queue
router.get("/refund/queue", adminMiddleware, refundController.getRefundQueue);
router.get("/refund/getAllCancelledBookings", adminMiddleware, refundController.getRefundQueue); // legacy alias
router.patch("/refund/update-status", adminMiddleware, refundController.updateRefundStatus);

// Refund Policy Routes
router.post("/refund-policy/create", adminMiddleware, refundPolicyController.createRefundPolicy);
router.get("/refund-policy/getAll", adminMiddleware, refundPolicyController.getAllRefundPolicies);
router.post("/refund-policy/getById", adminMiddleware, refundPolicyController.getRefundPolicyById);
router.patch("/refund-policy/update", adminMiddleware, refundPolicyController.updateRefundPolicy);
router.delete("/refund-policy/delete", adminMiddleware, refundPolicyController.deleteRefundPolicy);
router.patch("/refund-policy/toggleStatus", adminMiddleware, refundPolicyController.togglePolicyStatus);

// Shuvmarg Money (Wallet) Management
router.get("/wallet/overview",              adminMiddleware, adminWalletCtrl.getOverview);
router.get("/wallet/global-feed",           adminMiddleware, adminWalletCtrl.getGlobalFeed);
router.get("/wallet/lookup",                adminMiddleware, adminWalletCtrl.lookupUser);
router.post("/wallet/adjust",               adminMiddleware, adminWalletCtrl.adjustBalance);
router.patch("/wallet/freeze",              adminMiddleware, adminWalletCtrl.freezeWallet);
router.get("/wallet/user-balance/:userId",  adminMiddleware, adminWalletCtrl.getUserBalance);

// KYC Verification
router.get("/kyc/unified-list", adminMiddleware, kycVerificationController.getUnifiedKycList);
router.delete("/ticket/schedule/delete/:id", adminMiddleware, ticketController.deleteTicket);

// Legacy V2 seat-template reads remain temporarily for migration/old schedules.
// All new creation and revision work belongs to Seat Layout V3 below.
router.get("/templates/all", adminMiddleware, adminTemplateController.getAllSeatsTemplate);
router.get("/templates/user/:userId", adminMiddleware, adminTemplateController.getTemplatesByUser);
router.get("/templates/:id", adminMiddleware, adminTemplateController.getSeatTemplateById);
registerAdminSeatLayoutV3Routes(router, adminMiddleware);

// Station/Boarding Point Management
router.post("/ticket/create-route", adminMiddleware, ticketController.createRoute);
router.get("/ticket/getAllRoutes", adminMiddleware, ticketController.getAllRoutes);
router.get("/ticket/getRouteById/:id", adminMiddleware, ticketController.getRouteById);
router.patch("/ticket/updateRoute/:id", adminMiddleware, ticketController.updateRoute);
router.delete("/ticket/deleteRoute/:id", adminMiddleware, ticketController.deleteRoute);
router.patch("/ticket/toggleRouteStatus/:id", adminMiddleware, ticketController.toggleRouteStatus);
// Create ticket
router.post("/ticket/createTicket", adminMiddleware, ticketController.createTicket);
router.get("/ticket/getTicketById/:id", adminMiddleware, ticketController.getTicketById);
router.patch("/ticket/updateTicket/:id", adminMiddleware, ticketController.updateTicket);
router.patch("/ticket/updateTicketStatus/:id", adminMiddleware, ticketController.updateTicketStatus);
router.delete("/ticket/deleteTicket/:id", adminMiddleware, ticketController.deleteTicket);
// Amenities Routes
router.post("/ticket/amenities/create", adminMiddleware, amenitiesController.createAmenity);
/* 
170: router.get("/ticket/amenities/getAll", adminMiddleware, amenitiesController.getAllAmenities);
171: router.get("/ticket/amenities/getById/:id", adminMiddleware, amenitiesController.getAmenityById);
172: router.get("/ticket/amenities/getByUserId/:userId", adminMiddleware, amenitiesController.getAmenitiesByUserId);
173: router.patch("/ticket/amenities/bulk-update", adminMiddleware, amenitiesController.bulkUpdateAmenities);
174: router.delete("/ticket/amenities/delete/:amenityId/:userId", adminMiddleware, amenitiesController.deleteAmenity);
175: router.patch("/ticket/amenities/toggleStatus/:id", adminMiddleware, amenitiesController.toggleAmenityStatus);
*/
// Boarding Point Routes
/*
177: router.post("/ticket/boardingPoint/create", adminMiddleware, boardingPointController.createBoardingPoint);
178: router.get("/ticket/boardingPoint/getAll", adminMiddleware, boardingPointController.getAllBoardingPoints);
179: router.get("/ticket/boardingPoint/getById/:id", adminMiddleware, boardingPointController.getBoardingPointById);
180: router.patch("/ticket/boardingPoint/update/:id", adminMiddleware, boardingPointController.updateBoardingPoint);
181: router.delete("/ticket/boardingPoint/delete/:id", adminMiddleware, boardingPointController.deleteBoardingPoint);
182: router.patch("/ticket/boardingPoint/toggleStatus/:id", adminMiddleware, boardingPointController.toggleBoardingPointStatus);
*/

// Boarding Point Management (Admin on behalf of Owner)
// Station/Boarding Point Management (Global Registry)
router.post("/boardingPoints/create", adminMiddleware, boardingPointController.createBoardingPoint);
router.get("/boardingPoints/city/:city", adminMiddleware, boardingPointController.getPointsByCity);
router.get("/boardingPoints/owner/:ownerId", adminMiddleware, boardingPointController.getPointsByOwner);
router.get("/boardingPoints/:id", adminMiddleware, boardingPointController.getBoardingPointById);
router.patch("/boardingPoints/:id", adminMiddleware, boardingPointController.updateBoardingPoint);
router.delete("/boardingPoints/:id", adminMiddleware, boardingPointController.deleteBoardingPoint);

// Amenity Management (Global Registry)
router.get("/amenities/global", adminMiddleware, adminAmenityController.getAllGlobalAmenities);
router.post("/amenities/createGlobal", adminMiddleware, adminAmenityController.createGlobalAmenity);
router.post("/amenities/create", adminMiddleware, adminAmenityController.createAmenityForOwner);
router.get("/amenities/owner/:ownerId", adminMiddleware, adminAmenityController.getAvailableAmenities);
router.get("/amenities/:id", adminMiddleware, adminAmenityController.getAmenityById);
router.patch("/amenities/:id", adminMiddleware, adminAmenityController.updateAmenity);
router.delete("/amenities/:id", adminMiddleware, adminAmenityController.deleteAmenity);

// Bus Route Management (Admin on behalf of Owner)
router.post("/busRoutes/create", adminMiddleware, adminBusRouteController.createRouteForOwner);
router.post("/busRoutes/createGlobal", adminMiddleware, adminBusRouteController.createGlobalRoute);
router.get("/busRoutes/global", adminMiddleware, adminBusRouteController.getGlobalRoutes);
router.get("/busRoutes/owner/:ownerId", adminMiddleware, adminBusRouteController.getRoutesByOwner);
router.get("/busRoutes/:id", adminMiddleware, adminBusRouteController.getRouteById);
router.patch("/busRoutes/:id", adminMiddleware, adminBusRouteController.updateRouteByAdmin);
router.delete("/busRoutes/:id", adminMiddleware, adminBusRouteController.deleteRouteByAdmin);

// Dedicated Fleet Management (Admin on behalf of Owner)
router.post("/fleet/createForOwner", adminMiddleware, adminFleetController.createFleetForOwner);
router.get("/fleet/owner/:ownerId", adminMiddleware, adminFleetController.getFleetsByOwner);
// router.get("/fleet/details/:id" mounted via adminFrontendReadRoutes)
router.patch("/fleet/update/:id", adminMiddleware, adminFleetController.updateFleetByAdmin);
router.delete("/fleet/delete/:id", adminMiddleware, adminFleetController.deleteFleetByAdmin);
router.patch("/fleet/resubmit/:id", adminMiddleware, adminFleetController.resubmitFleetByAdmin);
router.patch("/fleet/reupload-doc/:id", adminMiddleware, adminFleetController.reuploadFleetDocument);
router.put("/fleet/:fleetId/documents/:slot", adminMiddleware, adminFleetDocumentController.uploadDocument);
router.get("/fleet/:fleetId/documents/:slot/read-url", adminMiddleware, adminFleetDocumentController.getDocumentReadUrl);
router.get("/fleet/:fleetId/documents/:slot/view", adminMiddleware, adminFleetDocumentController.viewDocument);

// ─── TRIP CONTROL CENTER (Platform-wide oversight — read-only) ────────────────
// Exception triage dashboard with per-trip booking aggregation
router.get("/trips/overview",          adminMiddleware, tripOverviewCtrl.getOverview);
// Schedule generation health monitor (CRON health check)
router.get("/trips/schedule-health",   adminMiddleware, tripOverviewCtrl.getScheduleHealth);
// Enhanced global trip search with booking stats
router.get("/trips/search",            adminMiddleware, tripOverviewCtrl.searchTrips);
// Route performance: load factor, revenue, completion rate per schedule
router.get("/trips/route-performance", adminMiddleware, tripOverviewCtrl.getRoutePerformance);

// Dedicated Trip Management (Admin on behalf of Owner)
router.post("/trips/create",               adminMiddleware, adminTripController.createTripForOwner);
router.get("/trips/all",                   adminMiddleware, adminTripController.getAllTrips);
router.get("/trips/owner/:ownerId",        adminMiddleware, adminTripController.getTripsByOwner);
router.get("/trips/details/:id",           adminMiddleware, adminTripController.getTripById);
router.patch("/trips/update/:id",          adminMiddleware, adminTripController.updateTripByAdmin);
router.patch("/trips/status/:id",          adminMiddleware, adminTripController.updateTripStatusByAdmin);
router.delete("/trips/delete/:id",         adminMiddleware, adminTripController.deleteTripByAdmin);

// ── Driver Assignment (per trip) ──────────────────────────────────────────────
router.patch("/trips/assign-driver/:id",   adminMiddleware, adminTripController.assignDriverToTrip);

// ── Driver Profile Management ─────────────────────────────────────────────────
// Full CRUD for brand-scoped driver profiles (separate from User accounts)
router.post("/drivers",                    adminMiddleware, driverController.createDriver);
router.get("/drivers",                     adminMiddleware, driverController.getAllDrivers);
router.get("/drivers/:id",                 adminMiddleware, driverController.getDriverById);
router.patch("/drivers/:id",               adminMiddleware, driverController.updateDriver);
router.patch("/drivers/:id/approve",       adminMiddleware, driverController.approveDriver);
router.patch("/drivers/:id/reject",        adminMiddleware, driverController.rejectDriver);
router.patch("/drivers/:id/assign-bus",    adminMiddleware, driverController.assignBusToDriver);
// GET /brands/:brandId/drivers — list approved drivers for a brand (used in schedule dropdown)
router.get("/brands/:brandId/drivers",     adminMiddleware, driverController.getDriversByBrand);


// Settlement Management (Admin)
router.get("/settlements/all", adminMiddleware, adminSettlementCon.getMySettlements);
router.patch("/settlements/pay", adminMiddleware, adminSettlementCon.paySettlement);

// Commission Analytics
router.get("/commissions/summary", adminMiddleware, commissionController.getCommissionSummary);
router.get("/commissions/history", adminMiddleware, commissionController.getCommissionHistory);

// Financial Overview
router.get("/financial/overview", adminMiddleware, financialController.getFinancialOverview);

// Analytics & Business Intelligence
router.get("/analytics/overview", adminMiddleware, analyticsController.getAnalyticsOverview);

// ─────────────────────────────────────────────────────────────────────────────
// PLATFORM REGISTRY (5-Layer Infrastructure System)
// ─────────────────────────────────────────────────────────────────────────────

// Layer 3: Stop Registry (Global nodes — build this FIRST)
// Bulk import routes MUST come before parameterized :id routes
router.post("/registry/stops/bulk-preview", adminMiddleware, platformRegistry.previewBulkImportStops);
router.post("/registry/stops/bulk-import",  adminMiddleware, platformRegistry.bulkImportStops);
router.post("/registry/stops",            adminMiddleware, platformRegistry.createStop);
router.get("/registry/stops",             adminMiddleware, platformRegistry.getAllStops);
router.get("/registry/stops/search",      adminMiddleware, platformRegistry.searchStops);
router.patch("/registry/stops/:id",       adminMiddleware, platformRegistry.updateStop);
router.delete("/registry/stops/:id",      adminMiddleware, platformRegistry.deleteStop);

// Layer 1: Route Corridors (City-to-city declarations)
router.post("/registry/corridors",        adminMiddleware, platformRegistry.createCorridor);
router.get("/registry/corridors",         adminMiddleware, platformRegistry.getAllCorridors);
router.patch("/registry/corridors/:id",   adminMiddleware, platformRegistry.updateCorridor);
router.delete("/registry/corridors/:id",  adminMiddleware, platformRegistry.deleteCorridor);

// Layer 2: Route Variants (Specific paths per corridor)
router.post("/registry/variants",                          adminMiddleware, platformRegistry.createVariant);
router.get("/registry/corridors/:corridorId/variants",    adminMiddleware, platformRegistry.getVariantsByCorridor);
router.get("/registry/variants/:id",                     adminMiddleware, platformRegistry.getVariantDetails);
router.post("/registry/variants/:id/revisions",          adminMiddleware, platformRegistry.createVariantRevision);
router.patch("/registry/variants/:id",                    adminMiddleware, platformRegistry.updateVariant);
router.delete("/registry/variants/:id",                   adminMiddleware, platformRegistry.deleteVariant);

// Draft-first route variant workflow. Google output is temporary review data;
// only approved platform Stops and the final sequence become canonical.
router.post("/registry/corridors/:corridorId/variant-drafts", adminMiddleware, platformRegistry.createVariantDraft);
router.get("/registry/variant-drafts/:variantId", adminMiddleware, platformRegistry.getVariantDraft);
router.post("/registry/variant-drafts/:variantId/route-options", adminMiddleware, platformRegistry.refreshVariantDraftRouteOptions);
router.get("/registry/variant-drafts/:variantId/guidance-places", adminMiddleware, platformRegistry.searchVariantDraftGuidancePlaces);
router.patch("/registry/variant-drafts/:variantId/select-route", adminMiddleware, platformRegistry.selectVariantDraftRouteOption);
router.patch("/registry/variant-drafts/:variantId/details", adminMiddleware, platformRegistry.updateVariantDraftDetails);
router.post("/registry/variant-drafts/:variantId/stop-candidates", adminMiddleware, platformRegistry.prepareVariantDraftStopCandidates);
router.post("/registry/variant-drafts/:variantId/stop-candidates/manual", adminMiddleware, platformRegistry.addExistingVariantDraftStop);
router.patch("/registry/variant-drafts/:variantId/stop-candidates/use-existing", adminMiddleware, platformRegistry.useAllMatchedVariantDraftCandidates);
router.patch("/registry/variant-drafts/:variantId/stop-candidates/:candidateId", adminMiddleware, platformRegistry.updateVariantDraftCandidate);
router.post("/registry/variant-drafts/:variantId/commit", adminMiddleware, platformRegistry.commitVariantDraft);
router.post("/registry/variant-drafts/:variantId/activate", adminMiddleware, platformRegistry.activateVariantDraft);

// Layer 4: Route Stop Mapping (Ordered stops per variant)
router.put("/registry/variants/:variantId/stops",  adminMiddleware, platformRegistry.setVariantStops);
router.get("/registry/variants/:variantId/stops",  adminMiddleware, platformRegistry.getStopsForVariant);

router.use("/registry", registryBoardingRoutes);

// Route Requests (Operator-submitted requests for new corridors)
router.get("/registry/route-requests",         adminMiddleware, routeRequestCtrl.getAllRouteRequests);
router.get("/registry/route-requests/:id",     adminMiddleware, routeRequestCtrl.getRouteRequestById);
router.patch("/registry/route-requests/:id",   adminMiddleware, routeRequestCtrl.reviewRouteRequest);

// ─────────────────────────────────────────────────────────────────────────────
// OPERATOR ROUTE CONFIG (Operator Service Setup Layer)
// ─────────────────────────────────────────────────────────────────────────────
// Get all registry variants (for operator to choose from when setting up a service)
router.get("/operator-config/variants",                                       adminMiddleware, operatorConfig.getAvailableVariants);
// Get all configs for a specific brand
router.get("/operator-config/:brandId",                                     adminMiddleware, operatorConfig.getOperatorConfigs);
// Get stops for a variant with brand's current selection state (accepts ?configId= for pattern precision)
router.get("/operator-config/:brandId/variant/:variantId/stops",           adminMiddleware, operatorConfig.getVariantStopsWithConfig);
// Get RETURN direction stops for a forward variant (powers Return tab in RouteConfigModal)
router.get("/operator-config/:brandId/variant/:variantId/return-stops",    adminMiddleware, operatorConfig.getReturnVariantStops);
// List all named patterns for a specific variant (powers schedule creation dropdown)
router.get("/operator-config/:brandId/variant/:variantId/patterns",        adminMiddleware, operatorConfig.listPatternsForVariant);
// Create or update brand's route config (now requires patternName in body)
router.post("/operator-config",                                                adminMiddleware, operatorConfig.upsertOperatorConfig);
// Update timing/stops on an existing config (blocked if active schedules exist)
router.patch("/operator-config/:configId",                                   adminMiddleware, operatorConfig.updateConfig);
// Toggle a config between ACTIVE and INACTIVE
router.patch("/operator-config/:configId/status",                           adminMiddleware, operatorConfig.toggleConfigStatus);
// Set a pattern as the default for its variant (for auto-resolution)
router.patch("/operator-config/:configId/set-default",                      adminMiddleware, operatorConfig.setDefaultPattern);
// Delete a config (blocked if any schedules reference it)
router.delete("/operator-config/:configId",                                  adminMiddleware, operatorConfig.deleteConfig);

// Rich route services view for the brand dashboard tab
router.get("/brands/:brandId/route-services",                               adminMiddleware, operatorConfig.getBrandRouteServices);

// ─────────────────────────────────────────────────────────────────────────────
// OPERATOR BRAND MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────────
router.post("/brands",                              adminMiddleware, operatorBrand.createBrand);
router.get("/brands",                               adminMiddleware, operatorBrand.getAllBrands);
router.get("/brands/:brandId",                      adminMiddleware, operatorBrand.getBrandById);
router.get("/owners/:ownerId/brands",               adminMiddleware, operatorBrand.getBrandsByOwner);
router.patch("/brands/:brandId/status",             adminMiddleware, operatorBrand.updateBrandStatus);
router.patch("/brands/:brandId",                    adminMiddleware, operatorBrand.updateBrand);

// Brand financial overview (powers FinancialTab in OperatorDetails)
router.get("/brands/:brandId/financials",            adminMiddleware, brandFinancialCtrl.getBrandFinancials);

// ────────────────────────────────────────────────────────────────────────────────
// SCHEDULE MANAGEMENT
// Schedules are the source of truth. Trips are generated FROM schedules.
// ────────────────────────────────────────────────────────────────────────────────
router.post("/schedules",                           adminMiddleware, scheduleController.createSchedule);
router.get("/schedules",                            adminMiddleware, scheduleController.getAllSchedules);
router.post("/schedules/generate",                  adminMiddleware, scheduleController.manualGenerateTrips);
router.get("/schedules/:id",                        adminMiddleware, scheduleController.getScheduleById);
router.patch("/schedules/:id",                      adminMiddleware, scheduleController.updateSchedule);
router.patch("/schedules/:id/activate",             adminMiddleware, scheduleController.activateSchedule);
// Two-phase go-live: activate confirms schedule, go-live triggers burst generation
router.patch("/schedules/:id/go-live",              adminMiddleware, scheduleController.goLiveSchedule);
router.patch("/schedules/:id/suspend",              adminMiddleware, scheduleController.suspendSchedule);
// Resume a SUSPENDED schedule — re-activates and triggers burst trip generation
// This is the Workstation "Resume Operations" action. Wizard is NOT used for this.
router.patch("/schedules/:id/resume",               adminMiddleware, scheduleController.resumeSchedule);
// Temporal versioning — create a future version with updated timings (industry standard)
// Seals current schedule on (effectiveFrom - 1 day), creates new version starting effectiveFrom
router.post("/schedules/:id/version",               adminMiddleware, scheduleController.createScheduleVersion);
// Permanently stop — any status → INACTIVE (soft delete, preserves audit trail)
router.patch("/schedules/:id/deactivate",           adminMiddleware, scheduleController.deactivateSchedule);
// Hard delete — DRAFT only (schedule was never activated, has no trips)
router.delete("/schedules/:id",                     adminMiddleware, scheduleController.deleteSchedule);
router.get("/schedules/:id/trips",                  adminMiddleware, scheduleController.getTripsBySchedule);
router.post("/schedules/:id/burst",                 adminMiddleware, scheduleController.burstGenerateTrips);
router.get("/brands/:brandId/schedules",            adminMiddleware, scheduleController.getSchedulesByBrand);

// ─── TRIP-LEVEL EXCEPTIONS (GTFS calendar_dates pattern) ───────────────────────────
// These operate on individual trips / date windows without touching the master schedule.
// Cancel single trip — releases seats, records reason
router.patch("/trips/:id/cancel",                   adminMiddleware, tripExceptionCtrl.cancelTrip);
// Reschedule single trip — time-shift one trip, bookings are preserved
router.patch("/trips/:id/reschedule",               adminMiddleware, tripExceptionCtrl.rescheduleTrip);
// Cancel a date range — maintenance windows, road closures, public holidays
router.post("/schedules/:id/cancel-range",          adminMiddleware, tripExceptionCtrl.cancelDateRange);
// Extra run — one-off trip on a date not in the regular schedule
router.post("/schedules/:id/extra-run",             adminMiddleware, tripExceptionCtrl.createExtraRun);

// ─── TRANSACTION MANAGEMENT ────────────────────────────────────────────────────
// Paginated list with stats + single detail view (full population)
router.get("/transactions",      adminMiddleware, transactionCtrl.getAllTransactions);
router.get("/transactions/:id",  adminMiddleware, transactionCtrl.getTransactionById);

// ─── DISPUTED PAYMENT MANAGEMENT ──────────────────────────────────────────────
// Money received by eSewa but booking creation failed on our end.
// Finance team resolves manually from the eSewa merchant dashboard.
const disputedPayments = require("../../controllers/adminController/disputedPaymentsController.js");
router.get("/disputes",                          adminMiddleware, disputedPayments.getDisputedPayments);
router.patch("/disputes/:transactionId/resolve", adminMiddleware, disputedPayments.resolveDispute);

// ─── PLATFORM CONFIG MANAGEMENT ───────────────────────────────────────────────
// Admin-configurable operational parameters: gateway fees, cashback config,
// SM Money settings, referral config. No code deployment needed to adjust.
const platformConfigCtrl = require("../../controllers/adminController/platformConfigController.js");
router.get("/platform-config",              adminMiddleware, platformConfigCtrl.listConfigs);
router.get("/platform-config/:key",         adminMiddleware, platformConfigCtrl.getConfig);
router.put("/platform-config/:key",         adminMiddleware, platformConfigCtrl.updateConfig);

// ─── SCRATCH CARD THEME MANAGEMENT ────────────────────────────────────────────
// Admin-managed overlay textures for scratch cards. Themes are weighted for
// probability-based random assignment during the booking checkout flow.
const scratchThemeCtrl = require("../../controllers/adminController/scratchThemeController.js");
router.get("/scratch-themes",                    adminMiddleware, scratchThemeCtrl.listThemes);
router.post("/scratch-themes",                   adminMiddleware, scratchThemeCtrl.createTheme);
router.patch("/scratch-themes/:themeId",          adminMiddleware, scratchThemeCtrl.updateTheme);
router.patch("/scratch-themes/:themeId/image",    adminMiddleware, scratchThemeCtrl.replaceThemeImage);
router.patch("/scratch-themes/:themeId/toggle",   adminMiddleware, scratchThemeCtrl.toggleTheme);
router.delete("/scratch-themes/:themeId",         adminMiddleware, scratchThemeCtrl.deleteTheme);

// ─── SECURE DOCUMENT PROXY ─────────────────────────────────────────────────────
// Streams private S3 objects through the server — the raw AWS presigned URL
// (with credential key ID, bucket path, and signature) is NEVER sent to the browser.
// Frontend calls: GET /api/admin/documents/view?key=owners/{id}/kyc/...
const documentProxy = require("../../src/modules/shared/document-proxy");
router.get("/documents/view", adminMiddleware, documentProxy.viewDocument);

module.exports = router;
