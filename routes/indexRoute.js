const express = require("express");
const router = express.Router();
const userRoute = require("./userRoutes/userRoutes.js");
const ticketRoute = require("./ticketRoutes/ticketRoutes.js");
const adminRoutes = require("./adminRoutes/adminRoutes.js");
const seedRoute = require("./seed/seedRoute.js");
const pushRoute = require("./pushNotification/pushNotification.js");
const referralRoutes = require("./referralRoutes/referralRoutes.js");
const reviewRoutes = require("./reviewRoutes/reviewRoutes.js");
const googleMapRoutes = require("./googleMapRoute/googleMapRoute.js")
const agentRoute = require("./agentRoute/agentRoute.js")
const busOwnerRoute = require("./busOwner/busOwner.js")
const publicRoute = require("./publicRoutes/publicRoute.js")
const paymentRoutes = require("./paymentRoutes/paymentRoutes.js")
const conductorRoutes = require("./conductorRoutes/conductorRoutes.js")

// Entity-specific self-registration auth routes
const busOwnerAuthRoutes = require("./authRoutes/busOwnerAuthRoutes.js");
const agentAuthRoutes = require("./authRoutes/agentAuthRoutes.js");
const activateAuthRoutes = require("./authRoutes/activateAuthRoutes.js");

router.use("/api", userRoute);
router.use("/api/ticket", ticketRoute);
router.use("/api/busowner", busOwnerRoute);
router.use("/api/admin", adminRoutes);
router.use("/api/referral", referralRoutes);
router.use("/api/reviews", reviewRoutes);
router.use("/seed", seedRoute);
router.use("/api/pushnoti", pushRoute);
router.use("/api/googlemap", googleMapRoutes)
router.use("/api/agent", agentRoute)
router.use("/api/public", publicRoute)
router.use("/api/payment", paymentRoutes)
router.use("/api/conductor", conductorRoutes)

// Entity-specific self-registration auth
router.use("/api/auth/busowner", busOwnerAuthRoutes);
router.use("/api/auth/agent", agentAuthRoutes);
router.use("/api/auth/activate", activateAuthRoutes);

module.exports = router;
