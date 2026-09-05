const express = require("express");
const router = express.Router();
const userRoute = require("./userRoutes/userRoutes.js");
const ticketRoute = require("./ticketRoutes/ticketRoutes.js");
const adminRoutes = require("./adminRoutes/adminRoutes.js");
const pushRoute = require("./pushNotification/pushNotification.js");
const referralRoutes = require("./referralRoutes/referralRoutes.js");
const reviewRoutes = require("./reviewRoutes/reviewRoutes.js");
const googleMapRoutes = require("./googleMapRoute/googleMapRoute.js")
const agentRoute = require("./agentRoute/agentRoute.js")
const busOwnerRoute = require("./busOwner/busOwner.js")
const publicRoute = require("./publicRoutes/publicRoute.js")
const conductorRoutes = require("./conductorRoutes/conductorRoutes.js")
const driverRoutes = require("./driverRoutes/driverRoutes.js")

// Entity-specific self-registration auth routes
const busOwnerAuthRoutes = require("./authRoutes/busOwnerAuthRoutes.js");
const agentAuthRoutes = require("./authRoutes/agentAuthRoutes.js");
const driverAuthRoutes = require("./authRoutes/driverAuthRoutes.js");
const activateAuthRoutes = require("./authRoutes/activateAuthRoutes.js");
const passengerAuthRoutes = require("./authRoutes/passengerAuthRoutes.js");

const partnerLeadRoutes = require("./partnerLeadRoutes.js");
const contractRoutes = require("./contractRoutes.js");

router.use("/api", userRoute);
router.use("/api/ticket", ticketRoute);
router.use("/api/busowner", busOwnerRoute);
router.use("/api/admin", adminRoutes);
router.use("/api/contracts", contractRoutes);
router.use("/api/referral", referralRoutes);
router.use("/api/reviews", reviewRoutes);
router.use("/api/pushnoti", pushRoute);
router.use("/api/googlemap", googleMapRoutes)
router.use("/api/agent", agentRoute)
router.use("/api/public", publicRoute)
router.use("/api/conductor", conductorRoutes)
router.use("/api/driver", driverRoutes)
router.use("/api", partnerLeadRoutes);

// Entity-specific self-registration auth
router.use("/api/auth/busowner", busOwnerAuthRoutes);
router.use("/api/auth/agent", agentAuthRoutes);
router.use("/api/auth/driver", driverAuthRoutes);
router.use("/api/auth/activate", activateAuthRoutes);
router.use("/api/auth/passenger", passengerAuthRoutes);

module.exports = router;
