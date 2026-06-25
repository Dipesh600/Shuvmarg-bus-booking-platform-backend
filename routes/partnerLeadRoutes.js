/**
 * routes/partnerLeadRoutes.js
 *
 * Partner lead routes. Replaces demoRequestRoutes.js.
 * Mounted at /api via indexRoute.js.
 */

"use strict";

const express = require("express");
const router = express.Router();
const adminMiddleware = require("../middleware/adminMiddleware");
const {
  createContactFormLead,
  getPartnerLeads,
  updatePartnerLead,
} = require("../controllers/partnerLeadController");

// Public — no auth required
router.post("/public/partner-leads", createContactFormLead);

// Admin — requires admin JWT
router.get("/admin/partner-leads", adminMiddleware, getPartnerLeads);
router.patch("/admin/partner-leads/:id", adminMiddleware, updatePartnerLead);

module.exports = router;
