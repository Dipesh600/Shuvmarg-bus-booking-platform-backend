const express = require("express");
const router = express.Router();
const googleMapController = require("../../controllers/googleMapRouteController/googleMapRouteController.js");
const auth = require("../../middleware/authMiddleware.js");
router.post(
  "/createRoute",
  auth,
  googleMapController.storeRouteByPlaces
);
router.get("/decode-addresses", googleMapController.decodeRouteAddresses);
module.exports = router;
