const express = require("express");
const router = express.Router();
const admin = require("../../controllers/adminController/adminController.js");
const bookings = require("../../controllers/adminController/booking/bookingController.js");
const coupon = require("../../controllers/adminController/coupon-controller/adminCouponController.js");
const autoSeat = require("../../controllers/adminController/seat-controller/adminAutoSeatController.js");
const authController = require("../../controllers/adminController/authController/auth-controller.js");
const adminMiddleware = require("../../middleware/adminMiddleware.js");
const dashboard = require("../../controllers/adminController/dashboardController/dashboardController.js");
const userDashboard = require("../../controllers/adminController/dashboardController/userDashboardController.js");
const agentController = require("../../controllers/adminController/adminAgentController/adminAgentController.js");
const busOwnerController = require("../../controllers/adminController/busOwnerController/adminBusOwnerController.js");
const adminPushnotification = require("../../controllers/adminController/adminPushnotification.js/adminPushnotification.js");
const busOwnerFleetController = require("../../controllers/adminController/busOwnerController/adminBusOwnerFleetController.js");
const refundController = require("../../controllers/adminController/refundController/adminRefundController.js");
const refundPolicyController = require("../../controllers/adminController/refundPolicyController/refundPolicycontroller.js");
const kycVerificationController = require("../../controllers/adminController/kycVerificationController/kycVerificationcontroller.js");
const ticketController = require("../../controllers/adminController/ticket-controller/adminTicketController.js");
const amenitiesController = require("../../controllers/adminController/ticket-controller/adminamenitiesController.js");
const boardingPointController = require("../../controllers/adminController/ticket-controller/adminBoardingPoinController.js");
const adminBoardingPointController = require("../../controllers/adminController/busOwnerController/boardingPointController.js");
const adminAmenityController = require("../../controllers/adminController/amenity/amenityController.js");
const adminBusRouteController = require("../../controllers/adminController/busOwnerController/busRouteController.js");
const adminFleetController = require("../../controllers/adminController/busOwnerController/fleetController.js");
const adminTemplateController = require("../../controllers/adminController/busOwnerController/templateController.js");
const adminTripController = require("../../controllers/adminController/busOwnerController/tripController.js");
// Auth Routes
router.post("/auth/login", authController.login);
router.get("/auth/profile", adminMiddleware, authController.getAdminProfile);

// User Management Routes
router.post("/createAccount", adminMiddleware, admin.createAccount);
router.delete("/deleteAccount", adminMiddleware, admin.deleteAccount);
router.patch("/updateAccount", adminMiddleware, admin.updateAccount);
router.get("/getAllUsers", adminMiddleware, admin.getAllUsers);
router.get("/userDashboard", adminMiddleware, userDashboard.getUserDashboardStats);
router.post("/getuserById", adminMiddleware, admin.getUserById);
router.post("/activity", adminMiddleware, admin.getUserActivitySummary);
router.post("/accountStatus", adminMiddleware, admin.getUserAccountStatus);
router.patch("/resetPassword", adminMiddleware, admin.changeUserPassword);
router.patch("/updateStatus", adminMiddleware, admin.updateUserStatus);
router.post("/getUserBookings", adminMiddleware, admin.getUserBookings);

// Ticket Management Routes
router.get("/getAllTicket", adminMiddleware, ticketController.getAllTickets);

// Auto Seat Management
router.post("/auto-seats", adminMiddleware, autoSeat.createAutoSeat);

// Booking Management Routes
router.get("/booking/getAllBookings", adminMiddleware, bookings.getAllBookings);
router.get("/booking/stats", adminMiddleware, bookings.getBookingStats);
router.get("/booking/getBookingById/:bookingid", adminMiddleware, bookings.getBookingById);
router.post("/booking/getBookingsByUser", adminMiddleware, bookings.getBookingsByUser);
// Coupon Management Routes
router.post("/coupons", adminMiddleware, coupon.createCoupon);
router.get("/coupons", adminMiddleware, coupon.getAllCoupons);
router.get("/coupons/:id", adminMiddleware, coupon.getCouponById);
router.put("/coupons/:id", adminMiddleware, coupon.updateCoupon);
router.delete("/coupons/:id", adminMiddleware, coupon.deleteCoupon);
router.patch(
  "/coupons/:id/toggle-status",
  adminMiddleware,
  coupon.toggleCouponStatus
);
router.get("/coupons-stats", adminMiddleware, coupon.getCouponUsageStats);

// Dashboard
router.get("/dashboard", adminMiddleware, dashboard.getDashboardStats);

// User Dashboard
router.get("/userdashboard", adminMiddleware, userDashboard.getUserDashboardStats);

// 2 Step Verification
router.post("/two-factor/setup", adminMiddleware, authController.setupTwoFactor);

// Agent 
router.post("/getAgentDetails", adminMiddleware, agentController.getAgentsById);
router.get("/getAllAgents", adminMiddleware, agentController.getAllAgents);
router.get("/agentDashboard", adminMiddleware, agentController.getAgentDashboard);
router.post("/makeUserAgent", adminMiddleware, agentController.makeUserAgent);
router.patch("/agentKycStatus", adminMiddleware, agentController.updateAgentKyc);

// Bus Owner
router.get("/getAllBusOwners", adminMiddleware, busOwnerController.getAllBusOwners);
router.post("/getBusOwnerDetails", adminMiddleware, busOwnerController.getBusOwnerById);
router.get("/getAllBusOwnerKycs", adminMiddleware, busOwnerController.getAllBusOwnerKycs);
router.post("/getBusOwnerKycDetails", adminMiddleware, busOwnerController.getBusOwnerKycById);
// router.post("/makeUserBusOwner", adminMiddleware, busOwnerController.makeUserBusOwner);
router.patch("/busOwnerKycStatus", adminMiddleware, busOwnerController.updateBusOwnerKyc);
router.get("/busOwnerDashboard", adminMiddleware, busOwnerController.getBusOwnerDashboard);

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
// Bus Owner Fleet
router.get("/fleet/getAllFleet", adminMiddleware, busOwnerFleetController.getAllFleet);
router.get("/fleet/getById/:id", adminMiddleware, busOwnerFleetController.getFleetById);
router.patch("/fleet/update-status", adminMiddleware, busOwnerFleetController.updateFleetStatus);
router.get('/fleet/fleetDashboard', adminMiddleware, busOwnerFleetController.getFleetDashboard)

// Refund
router.get("/refund/getAllCancelledBookings", adminMiddleware, refundController.getCancelledBookings);
router.patch("/refund/update-status", adminMiddleware, refundController.updateRefundStatus);

// Refund Policy Routes
router.post("/refund-policy/create", adminMiddleware, refundPolicyController.createRefundPolicy);
router.get("/refund-policy/getAll", adminMiddleware, refundPolicyController.getAllRefundPolicies);
router.post("/refund-policy/getById", adminMiddleware, refundPolicyController.getRefundPolicyById);
router.patch("/refund-policy/update", adminMiddleware, refundPolicyController.updateRefundPolicy);
router.delete("/refund-policy/delete", adminMiddleware, refundPolicyController.deleteRefundPolicy);
router.patch("/refund-policy/toggleStatus", adminMiddleware, refundPolicyController.togglePolicyStatus);

// KYC Verification
router.get("/kyc/unified-list", adminMiddleware, kycVerificationController.getUnifiedKycList);
router.delete("/ticket/schedule/delete/:id", adminMiddleware, ticketController.deleteTicket);

// Seat Template Management (Admin on behalf of Owner)
router.get("/templates/all", adminMiddleware, adminTemplateController.getAllSeatsTemplate);
router.post("/templates/create", adminMiddleware, adminTemplateController.createTemplateForOwner);
router.get("/templates/user/:userId", adminMiddleware, adminTemplateController.getTemplatesByUser);
router.get("/templates/:id", adminMiddleware, adminTemplateController.getSeatTemplateById);
router.patch("/templates/:id", adminMiddleware, adminTemplateController.updateSeatTemplate);
router.delete("/templates/:id", adminMiddleware, adminTemplateController.deleteSeatTemplate);
router.patch("/templates/toggleStatus/:id", adminMiddleware, adminTemplateController.toggleSeatTemplateStatus);

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
router.get("/ticket/amenities/getAll", adminMiddleware, amenitiesController.getAllAmenities);
router.get("/ticket/amenities/getById/:id", adminMiddleware, amenitiesController.getAmenityById);
router.get("/ticket/amenities/getByUserId/:userId", adminMiddleware, amenitiesController.getAmenitiesByUserId);
router.patch("/ticket/amenities/bulk-update", adminMiddleware, amenitiesController.bulkUpdateAmenities);
router.delete("/ticket/amenities/delete/:amenityId/:userId", adminMiddleware, amenitiesController.deleteAmenity);
router.patch("/ticket/amenities/toggleStatus/:id", adminMiddleware, amenitiesController.toggleAmenityStatus);
// Boarding Point Routes
router.post("/ticket/boardingPoint/create", adminMiddleware, boardingPointController.createBoardingPoint);
router.get("/ticket/boardingPoint/getAll", adminMiddleware, boardingPointController.getAllBoardingPoints);
router.get("/ticket/boardingPoint/getById/:id", adminMiddleware, boardingPointController.getBoardingPointById);
router.patch("/ticket/boardingPoint/update/:id", adminMiddleware, boardingPointController.updateBoardingPoint);
router.delete("/ticket/boardingPoint/delete/:id", adminMiddleware, boardingPointController.deleteBoardingPoint);
router.patch("/ticket/boardingPoint/toggleStatus/:id", adminMiddleware, boardingPointController.toggleBoardingPointStatus);

// Boarding Point Management (Admin on behalf of Owner)
router.post("/boardingPoints/create", adminMiddleware, adminBoardingPointController.createBoardingPointForOwner);
router.get("/boardingPoints/owner/:ownerId", adminMiddleware, adminBoardingPointController.getBoardingPointsByOwner);
router.get("/boardingPoints/:id", adminMiddleware, adminBoardingPointController.getBoardingPointById);
router.patch("/boardingPoints/:id", adminMiddleware, adminBoardingPointController.updateBoardingPointByAdmin);
router.delete("/boardingPoints/:id", adminMiddleware, adminBoardingPointController.deleteBoardingPointByAdmin);

// Amenity Management (Admin on behalf of Owner)
router.post("/amenities/create", adminMiddleware, adminAmenityController.createAmenityForOwner);
router.get("/amenities/owner/:ownerId", adminMiddleware, adminAmenityController.getAmenitiesByOwner);
router.get("/amenities/:id", adminMiddleware, adminAmenityController.getAmenityById);
router.patch("/amenities/:id", adminMiddleware, adminAmenityController.updateAmenityByAdmin);
router.delete("/amenities/:id", adminMiddleware, adminAmenityController.deleteAmenityByAdmin);

// Bus Route Management (Admin on behalf of Owner)
router.post("/busRoutes/create", adminMiddleware, adminBusRouteController.createRouteForOwner);
router.get("/busRoutes/owner/:ownerId", adminMiddleware, adminBusRouteController.getRoutesByOwner);
router.get("/busRoutes/:id", adminMiddleware, adminBusRouteController.getRouteById);
router.patch("/busRoutes/:id", adminMiddleware, adminBusRouteController.updateRouteByAdmin);
router.delete("/busRoutes/:id", adminMiddleware, adminBusRouteController.deleteRouteByAdmin);

// Dedicated Fleet Management (Admin on behalf of Owner)
router.post("/fleet/createForOwner", adminMiddleware, adminFleetController.createFleetForOwner);
router.get("/fleet/owner/:ownerId", adminMiddleware, adminFleetController.getFleetsByOwner);
router.get("/fleet/details/:id", adminMiddleware, adminFleetController.getFleetById);
router.patch("/fleet/update/:id", adminMiddleware, adminFleetController.updateFleetByAdmin);
router.delete("/fleet/delete/:id", adminMiddleware, adminFleetController.deleteFleetByAdmin);

// Dedicated Trip Management (Admin on behalf of Owner)
router.post("/trips/create", adminMiddleware, adminTripController.createTripForOwner);
router.get("/trips/owner/:ownerId", adminMiddleware, adminTripController.getTripsByOwner);
router.get("/trips/details/:id", adminMiddleware, adminTripController.getTripById);
router.patch("/trips/update/:id", adminMiddleware, adminTripController.updateTripByAdmin);
router.delete("/trips/delete/:id", adminMiddleware, adminTripController.deleteTripByAdmin);

module.exports = router;
