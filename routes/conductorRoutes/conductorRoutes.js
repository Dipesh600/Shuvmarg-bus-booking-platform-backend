const express              = require("express");
const router               = express.Router();
const conductorCon         = require("../../controllers/conductorController/conductorController.js");
const { busOwnerMiddleware } = require("../../middleware/checkRole.js");

/**
 * Conductor Routes — /api/conductor
 *
 * Currently accessible by the bus owner who acts as the conductor.
 * When a dedicated conductor role is added, replace busOwnerMiddleware
 * with a combined middleware: conductorMiddleware || busOwnerMiddleware.
 */

// POST /api/conductor/confirmBoarding
// Body: { ticketId, tripId }
router.post("/confirmBoarding", busOwnerMiddleware, conductorCon.confirmBoarding);

// GET /api/conductor/manifest/:tripId
// Returns full passenger manifest for a trip
router.get("/manifest/:tripId", busOwnerMiddleware, conductorCon.getTripManifest);

module.exports = router;
