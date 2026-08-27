"use strict";

const agentSeatHold = require("../../src/modules/agent/seat-hold");
const agentCashSale = require("../../src/modules/agent/cash-sale");
const agentSaleWriteRateLimit = require("../../middleware/agentSaleWriteRateLimit.js");

// Both writes share the agent chain. The authorization gates run when the hold
// is created; commit honors an already-authorized, short-lived hold.
const registerAgentSaleRoutes = (router, chain) => {
  router.post(
    "/seat-holds",
    chain.auth,
    chain.verifyRoleFromDB,
    chain.agentMiddleware,
    agentSaleWriteRateLimit,
    agentSeatHold.createHold,
  );
  router.post(
    "/sales",
    chain.auth,
    chain.verifyRoleFromDB,
    chain.agentMiddleware,
    agentSaleWriteRateLimit,
    agentCashSale.commitSale,
  );
};

module.exports = registerAgentSaleRoutes;
