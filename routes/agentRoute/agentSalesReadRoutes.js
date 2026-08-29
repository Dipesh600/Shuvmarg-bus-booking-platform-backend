"use strict";

const history = require("../../src/modules/agent/sales-history");
const limiter = require("../../middleware/agentSalesReadRateLimit.js");

const registerAgentSalesReadRoutes = (router, chain) => {
  router.get(
    "/sales",
    chain.auth,
    chain.verifyRoleFromDB,
    chain.agentMiddleware,
    limiter,
    history.listSales,
  );
  router.get(
    "/customers",
    chain.auth,
    chain.verifyRoleFromDB,
    chain.agentMiddleware,
    limiter,
    history.listCustomers,
  );
};

module.exports = registerAgentSalesReadRoutes;
