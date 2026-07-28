/**
 * routes/partnerLeadRoutes.js
 *
 * Partner lead routes for both busOwner and agent portals.
 * Mounted at /api via indexRoute.js.
 */

"use strict";

const express = require("express");
const router  = express.Router();
const adminMiddleware = require("../middleware/adminMiddleware");
const {
  // BusOwner
  createContactFormLead,
  getPartnerLeads,
  getPartnerLeadStats,
  updatePartnerLead,
  // Agent
  createAgentContactFormLead,
  getAgentLeads,
  getAgentLeadStats,
  updateAgentLead,
} = require("../controllers/partnerLeadController");

// ─── Public — no auth required ────────────────────────────────────────────────

// BusOwner contact form lead (from busowner website)
router.post("/public/partner-leads",  createContactFormLead);

// Agent contact form lead (from agent partner website)
router.post("/public/agent-leads",    createAgentContactFormLead);

// ─── Admin — requires admin JWT ───────────────────────────────────────────────

// BusOwner leads
router.get("/admin/partner-leads/stats", adminMiddleware, getPartnerLeadStats);
router.get("/admin/partner-leads",       adminMiddleware, getPartnerLeads);
router.patch("/admin/partner-leads/:id", adminMiddleware, updatePartnerLead);

// Agent leads
router.get("/admin/agent-leads/stats",   adminMiddleware, getAgentLeadStats);
router.get("/admin/agent-leads",         adminMiddleware, getAgentLeads);
router.patch("/admin/agent-leads/:id",   adminMiddleware, updateAgentLead);

module.exports = router;
