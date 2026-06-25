/**
 * models/PartnerLead.js
 *
 * Stores potential bus operator leads from two sources:
 *
 *   'contact_form' — user filled the "Request Demo" / "Become a Partner" form
 *                    on the busowner website (name + phone + district provided).
 *
 *   'otp_verified' — user started registration on the busowner portal, verified
 *                    their phone via OTP, but never completed full registration.
 *                    Only phone is guaranteed; name/district may be added later.
 *
 * Status lifecycle:
 *   new → contacted → converted
 *   'converted' is set automatically when the lead completes bus owner registration.
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

    // For future multi-source tracking (e.g. 'web', 'mobile', 'agent')
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

// Prevent exact duplicate leads (same phone + same leadType)
partnerLeadSchema.index({ phone: 1, leadType: 1 }, { unique: true });

const PartnerLead = mongoose.model("PartnerLead", partnerLeadSchema);

module.exports = PartnerLead;
