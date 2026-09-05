const express = require("express");
const router = express.Router();
const googleMapController = require("../../controllers/googleMapRouteController/googleMapRouteController.js");
const admin = require('../../middleware/adminMiddleware');
const requireAccountAdministration = require('../../middleware/requireAccountAdministration');
const rateLimit = require('express-rate-limit');
const { createRateLimitStore } = require('../../src/shared/http/mongo-rate-limit-store');
router.use(admin, requireAccountAdministration, rateLimit({
  windowMs: 15 * 60 * 1000, max: 5, store: createRateLimitStore('map-geocoding'),
  keyGenerator: req => String(req.adminInfo.id), standardHeaders: true, legacyHeaders: false,
}));
router.post(
  "/createRoute",
  googleMapController.storeRouteByPlaces
);
router.get("/decode-addresses", googleMapController.decodeRouteAddresses);
module.exports = router;
