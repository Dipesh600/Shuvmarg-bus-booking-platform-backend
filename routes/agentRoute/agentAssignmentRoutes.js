"use strict";

const response = require("../../src/modules/agent/assignment-response");
const listLimiter = require("../../middleware/agentAssignmentListRateLimit.js");
const respondLimiter = require("../../middleware/agentAssignmentRespondRateLimit.js");

const registerAgentAssignmentRoutes = (router, chain) => {
  router.get(
    "/assignments",
    chain.auth,
    chain.verifyRoleFromDB,
    chain.agentMiddleware,
    listLimiter,
    response.listAssignments,
  );
  for (const action of ["accept", "decline"]) {
    router.post(
      `/assignments/:assignmentId/${action}`,
      chain.auth,
      chain.verifyRoleFromDB,
      chain.agentMiddleware,
      respondLimiter,
      response[`${action}Assignment`],
    );
  }
};

module.exports = registerAgentAssignmentRoutes;
