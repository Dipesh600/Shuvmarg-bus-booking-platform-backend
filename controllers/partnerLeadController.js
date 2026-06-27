/**
 * controllers/partnerLeadController.js
 *
 * Handles partner lead capture and admin management for both busOwner and agent leads.
 *
 * Public endpoints (no auth):
 *   POST /api/public/partner-leads           — create a contact_form lead (busOwner)
 *   POST /api/public/agent-leads             — create a contact_form lead (agent)
 *
 * Admin endpoints (admin JWT required):
 *   GET  /api/admin/partner-leads            — list busOwner leads with filters
 *   PATCH /api/admin/partner-leads/:id       — update busOwner lead status / notes
 *   GET  /api/admin/agent-leads              — list agent leads with filters
 *   GET  /api/admin/agent-leads/stats        — agent lead funnel stats
 *   PATCH /api/admin/agent-leads/:id         — update agent lead status / notes
 */

"use strict";

const PartnerLead = require("../models/PartnerLead");
const { normalizePhone } = require("../utils/phoneGuard");

// ─── Shared helpers ───────────────────────────────────────────────────────────

/**
 * Core upsert helper — creates or updates a contact_form lead.
 * Used by both busOwner and agent contact form endpoints.
 */
async function upsertContactFormLead(phone, fullName, district, entityType, source = "web") {
  return PartnerLead.findOneAndUpdate(
    { phone, leadType: "contact_form", entityType },
    {
      phone,
      fullName: fullName ? fullName.trim() : null,
      district: district ? district.trim() : null,
      leadType: "contact_form",
      entityType,
      phoneVerified: false,
      source,
      $setOnInsert: { status: "new" },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

/**
 * Core list helper — returns leads for a given entityType with optional filters.
 */
async function listLeads(entityType, query) {
  const filter = { entityType };

  if (query.leadType && ["contact_form", "otp_verified"].includes(query.leadType)) {
    filter.leadType = query.leadType;
  }

  if (query.status && ["new", "contacted", "converted"].includes(query.status)) {
    filter.status = query.status;
  }

  // Text search on fullName or phone
  if (query.search) {
    const s = query.search.trim();
    filter.$or = [
      { fullName: { $regex: s, $options: "i" } },
      { phone: { $regex: s, $options: "i" } },
    ];
  }

  // Pagination
  const page  = Math.max(1, parseInt(query.page)  || 1);
  const limit = Math.min(100, parseInt(query.limit) || 50);
  const skip  = (page - 1) * limit;

  const [leads, total] = await Promise.all([
    PartnerLead.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    PartnerLead.countDocuments(filter),
  ]);

  return { leads, total, page, limit, totalPages: Math.ceil(total / limit) };
}

/**
 * Core stats helper — returns funnel counts for a given entityType.
 */
async function getLeadStats(entityType) {
  const [total, byStatus, byLeadType] = await Promise.all([
    PartnerLead.countDocuments({ entityType }),
    PartnerLead.aggregate([
      { $match: { entityType } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
    PartnerLead.aggregate([
      { $match: { entityType } },
      { $group: { _id: "$leadType", count: { $sum: 1 } } },
    ]),
  ]);

  const statusMap  = Object.fromEntries(byStatus.map((s)  => [s._id, s.count]));
  const leadTypeMap = Object.fromEntries(byLeadType.map((l) => [l._id, l.count]));

  return {
    total,
    new:       statusMap.new        || 0,
    contacted: statusMap.contacted  || 0,
    converted: statusMap.converted  || 0,
    contactForm:  leadTypeMap.contact_form  || 0,
    otpVerified:  leadTypeMap.otp_verified  || 0,
    conversionRate: total > 0
      ? (((statusMap.converted || 0) / total) * 100).toFixed(1)
      : "0.0",
  };
}

// ─── Public — BusOwner contact form ──────────────────────────────────────────

/**
 * POST /api/public/partner-leads
 *
 * Creates a contact_form busOwner lead.
 * Called from the busowner website's "Become a Partner" / "Request Demo" form.
 *
 * Body: { fullName, phone, district }
 */
exports.createContactFormLead = async (req, res) => {
  try {
    const { fullName, district } = req.body;
    const rawPhone = req.body.phone;

    if (!fullName || !rawPhone || !district) {
      return res.status(400).json({
        success: false,
        message: "Full name, phone number, and district are required.",
      });
    }

    const phone = normalizePhone(rawPhone);
    if (!phone) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid Nepal mobile number.",
      });
    }

    await upsertContactFormLead(phone, fullName, district, "busOwner", "web");

    return res.status(201).json({
      success: true,
      message: "Thank you! We will reach out to you shortly.",
    });
  } catch (error) {
    console.error("[PartnerLead createContactFormLead] Error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Failed to submit. Please try again.",
    });
  }
};

// ─── Public — Agent contact form ──────────────────────────────────────────────

/**
 * POST /api/public/agent-leads
 *
 * Creates a contact_form agent lead.
 * Called from the agent partner website's "Become a Partner" form.
 *
 * Body: { fullName, phone, district? }
 */
exports.createAgentContactFormLead = async (req, res) => {
  try {
    const { fullName, district } = req.body;
    const rawPhone = req.body.phone;

    if (!fullName || !rawPhone) {
      return res.status(400).json({
        success: false,
        message: "Full name and phone number are required.",
      });
    }

    const phone = normalizePhone(rawPhone);
    if (!phone) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid Nepal mobile number.",
      });
    }

    await upsertContactFormLead(phone, fullName, district || null, "agent", "agent_web");

    return res.status(201).json({
      success: true,
      message: "Thank you! We will reach out to you shortly.",
    });
  } catch (error) {
    console.error("[PartnerLead createAgentContactFormLead] Error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Failed to submit. Please try again.",
    });
  }
};

// ─── Admin — BusOwner leads ───────────────────────────────────────────────────

/**
 * GET /api/admin/partner-leads
 *
 * Returns busOwner leads, newest first.
 * Supports: ?leadType= ?status= ?search= ?page= ?limit=
 */
exports.getPartnerLeads = async (req, res) => {
  try {
    const result = await listLeads("busOwner", req.query);
    return res.status(200).json({ success: true, ...result, data: result.leads });
  } catch (error) {
    console.error("[PartnerLead getPartnerLeads] Error:", error.message);
    return res.status(500).json({ success: false, message: "Failed to fetch leads." });
  }
};

/**
 * GET /api/admin/partner-leads/stats
 *
 * Returns busOwner lead funnel stats.
 */
exports.getPartnerLeadStats = async (req, res) => {
  try {
    const stats = await getLeadStats("busOwner");
    return res.status(200).json({ success: true, data: stats });
  } catch (error) {
    console.error("[PartnerLead getPartnerLeadStats] Error:", error.message);
    return res.status(500).json({ success: false, message: "Failed to fetch stats." });
  }
};

/**
 * PATCH /api/admin/partner-leads/:id
 *
 * Update a busOwner lead's status or add notes.
 * Body: { status?, notes? }
 */
exports.updatePartnerLead = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;

    const validStatuses = ["new", "contacted", "converted"];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
      });
    }

    const updatePayload = {};
    if (status) updatePayload.status = status;
    if (notes !== undefined) updatePayload.notes = notes;

    if (Object.keys(updatePayload).length === 0) {
      return res.status(400).json({
        success: false,
        message: "No valid fields to update. Provide status or notes.",
      });
    }

    const updated = await PartnerLead.findByIdAndUpdate(
      id,
      { $set: updatePayload },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ success: false, message: "Lead not found." });
    }

    return res.status(200).json({ success: true, message: "Lead updated.", data: updated });
  } catch (error) {
    console.error("[PartnerLead updatePartnerLead] Error:", error.message);
    return res.status(500).json({ success: false, message: "Failed to update lead." });
  }
};

// ─── Admin — Agent leads ──────────────────────────────────────────────────────

/**
 * GET /api/admin/agent-leads
 *
 * Returns agent leads, newest first.
 * Supports: ?leadType= ?status= ?search= ?page= ?limit=
 */
exports.getAgentLeads = async (req, res) => {
  try {
    const result = await listLeads("agent", req.query);
    return res.status(200).json({ success: true, ...result, data: result.leads });
  } catch (error) {
    console.error("[PartnerLead getAgentLeads] Error:", error.message);
    return res.status(500).json({ success: false, message: "Failed to fetch agent leads." });
  }
};

/**
 * GET /api/admin/agent-leads/stats
 *
 * Returns agent lead funnel stats (total, new, contacted, converted, conversionRate).
 */
exports.getAgentLeadStats = async (req, res) => {
  try {
    const stats = await getLeadStats("agent");
    return res.status(200).json({ success: true, data: stats });
  } catch (error) {
    console.error("[PartnerLead getAgentLeadStats] Error:", error.message);
    return res.status(500).json({ success: false, message: "Failed to fetch stats." });
  }
};

/**
 * PATCH /api/admin/agent-leads/:id
 *
 * Update an agent lead's status or add notes.
 * Body: { status?, notes? }
 */
exports.updateAgentLead = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;

    const validStatuses = ["new", "contacted", "converted"];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
      });
    }

    const updatePayload = {};
    if (status) updatePayload.status = status;
    if (notes !== undefined) updatePayload.notes = notes;

    if (Object.keys(updatePayload).length === 0) {
      return res.status(400).json({
        success: false,
        message: "No valid fields to update. Provide status or notes.",
      });
    }

    const updated = await PartnerLead.findByIdAndUpdate(
      id,
      { $set: updatePayload },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ success: false, message: "Lead not found." });
    }

    return res.status(200).json({ success: true, message: "Lead updated.", data: updated });
  } catch (error) {
    console.error("[PartnerLead updateAgentLead] Error:", error.message);
    return res.status(500).json({ success: false, message: "Failed to update lead." });
  }
};
