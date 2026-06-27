/**
 * models/PartnerLead.js
 *
 * Stores potential partner leads from multiple sources and entity types.
 *
 * Entity Types:
 *   'busOwner' — lead from the bus owner portal (operator)
 *   'agent'    — lead from the agent partner portal
 *
 * Lead Types:
 *   'contact_form' — user filled the "Request Demo" / "Become a Partner" form
 *                    on the website (name + phone + district provided).
 *
 *   'otp_verified' — user started registration on the portal, verified
 *                    their phone via OTP, but never completed full registration.
 *                    Only phone is guaranteed; name/district may be added later.
 *
 * Status lifecycle:
 *   new → contacted → converted
 *   'converted' is set automatically when the lead completes registration.
 */

"use strict";

const mongoose = require("mongoose");

const partnerLeadSchema = new mongoose.Schema(
  {
    phone: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    fullName: {
      type: String,
      trim: true,
      default: null,
    },

    district: {
      type: String,
      trim: true,
      default: null,
    },

    // Which portal did this lead come from?
    entityType: {
      type: String,
      enum: ["busOwner", "agent"],
      required: true,
      default: "busOwner",
      index: true,
    },

    leadType: {
      type: String,
      enum: ["contact_form", "otp_verified"],
      required: true,
      index: true,
    },

    phoneVerified: {
      type: Boolean,
      default: false,
    },

    status: {
      type: String,
      enum: ["new", "contacted", "converted"],
      default: "new",
      index: true,
    },

    // Which app/channel generated this lead
    source: {
      type: String,
      default: "web",
    },

    // Admin notes on this lead
    notes: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Prevent exact duplicate leads (same phone + same leadType + same entityType)
partnerLeadSchema.index({ phone: 1, leadType: 1, entityType: 1 }, { unique: true });

const PartnerLead = mongoose.model("PartnerLead", partnerLeadSchema);

module.exports = PartnerLead;
