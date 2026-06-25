/**
 * controllers/partnerLeadController.js
 *
 * Handles partner lead capture and admin management.
 *
 * Public endpoints (no auth):
 *   POST /api/public/partner-leads — create a contact_form lead
 *
 * Admin endpoints (admin JWT required):
 *   GET  /api/admin/partner-leads        — list all leads with filters
 *   PATCH /api/admin/partner-leads/:id   — update status / add notes
 */

"use strict";

const PartnerLead = require("../models/PartnerLead");
const { normalizePhone } = require("../utils/phoneGuard");

// ─── Public ───────────────────────────────────────────────────────────────────

/**
 * POST /api/public/partner-leads
 *
 * Creates a contact_form lead. Called from the busowner website's
 * "Become a Partner" / "Request Demo" form.
 *
 * Body: { fullName, phone, district }
 * All three required for contact_form leads.
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

    // Upsert: if same phone already exists as contact_form lead, update details
    await PartnerLead.findOneAndUpdate(
      { phone, leadType: "contact_form" },
      {
        phone,
        fullName: fullName.trim(),
        district: district.trim(),
        leadType: "contact_form",
        phoneVerified: false,
        // Don't overwrite status if already contacted
        $setOnInsert: { status: "new" },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

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

// ─── Admin ────────────────────────────────────────────────────────────────────

/**
 * GET /api/admin/partner-leads
 *
 * Returns all partner leads, newest first.
 * Supports query filters:
 *   ?leadType=contact_form|otp_verified
 *   ?status=new|contacted|converted
 */
exports.getPartnerLeads = async (req, res) => {
  try {
    const filter = {};

    if (req.query.leadType && ["contact_form", "otp_verified"].includes(req.query.leadType)) {
      filter.leadType = req.query.leadType;
    }

    if (req.query.status && ["new", "contacted", "converted"].includes(req.query.status)) {
      filter.status = req.query.status;
    }

    const leads = await PartnerLead.find(filter).sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: leads.length,
      data: leads,
    });
  } catch (error) {
    console.error("[PartnerLead getPartnerLeads] Error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch leads.",
    });
  }
};

/**
 * PATCH /api/admin/partner-leads/:id
 *
 * Update a lead's status or add notes.
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
      return res.status(404).json({
        success: false,
        message: "Lead not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Lead updated.",
      data: updated,
    });
  } catch (error) {
    console.error("[PartnerLead updatePartnerLead] Error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Failed to update lead.",
    });
  }
};
