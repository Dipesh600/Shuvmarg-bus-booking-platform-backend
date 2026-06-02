const express              = require("express");
const router               = express.Router();
const conductorCon         = require("../../controllers/conductorController/conductorController.js");
const auth                 = require("../../middleware/authMiddleware.js");
const verifyRoleFromDB     = require("../../middleware/verifyRoleFromDB.js");
const { busOwnerOrConductorMiddleware } = require("../../middleware/checkRole.js");

/**
 * Conductor Routes — /api/conductor
 *
 * Accessible by:
 *   - Bus owner (acting as conductor on their own trips)
 *   - Dedicated conductor (assigned by bus owner)
 */

// ── Pipeline: JWT verify → DB status check → role check ─────────────────────
router.use(auth, verifyRoleFromDB, busOwnerOrConductorMiddleware);

// POST /api/conductor/confirmBoarding
// Body: { ticketId, tripId }
router.post("/confirmBoarding", conductorCon.confirmBoarding);

// GET /api/conductor/manifest/:tripId
// Returns full passenger manifest for a trip
router.get("/manifest/:tripId", conductorCon.getTripManifest);

module.exports = router;
