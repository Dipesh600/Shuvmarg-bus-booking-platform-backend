"use strict";

const busOwnerAgentAssign = require("../../src/modules/bus-owner/agent-assign");
const busOwnerAgentInvite = require("../../src/modules/bus-owner/agent-invite");
const busOwnerAgentLookup = require("../../src/modules/bus-owner/agent-lookup");
const busOwnerAgentAssignRateLimit = require("../../middleware/busOwnerAgentAssignRateLimit.js");
const busOwnerAgentLookupRateLimit = require("../../middleware/busOwnerAgentLookupRateLimit.js");

/**
 * Ticket-agent routes for an operator.
 *
 * Registered from busOwner.js below its `requireApprovedBusOwner` line, so every
 * route here inherits it: only an approved operator may touch agents at all. The
 * caller's placement is load-bearing — mounting these earlier in that file would
 * silently drop the KYC requirement, which is why they are registered as a group
 * rather than left as loose `router.post` lines someone could move.
 *
 * The three endpoints are deliberately separate actions. Creating an agent mints
 * an identity and grants no selling right. Looking one up reads a preview.
 * Assigning creates an INVITED assignment that only the agent's own account can
 * turn ACTIVE. Nothing an operator can call here puts someone to work selling.
 */
function registerBusOwnerAgentRoutes(router) {
  // Create an agent identity from name + phone. The owner invites; the agent
  // activates themselves via /api/auth/activate.
  router.post("/agents", busOwnerAgentInvite.createAgent);

  // Look up an agent by the code they published, before inviting them.
  // Rate-limited because the code is the only thing standing between a caller and
  // someone else's agent preview.
  router.get("/agents/lookup/:code", busOwnerAgentLookupRateLimit, busOwnerAgentLookup.lookupAgent);

  // Invite an agent to sell one brand's inventory. Registered after the lookup so
  // "lookup" cannot be read as an :id by any future parameterised route here.
  router.post("/agents/assignments", busOwnerAgentAssignRateLimit, busOwnerAgentAssign.assignAgent);

  return router;
}

module.exports = {
  registerBusOwnerAgentRoutes,
};
