"use strict";

const mongoose = require("mongoose");

module.exports = new mongoose.Schema(
  {
    tole: { type: String, default: null, trim: true },
    wardNumber: { type: String, default: null, trim: true },
    municipality: { type: String, default: null, trim: true },
    district: { type: String, default: null, trim: true },
    province: {
      type: String,
      enum: ["Koshi", "Madhesh", "Bagmati", "Gandaki", "Lumbini", "Karnali", "Sudurpashchim", null],
      default: null,
    },
    postalCode: { type: String, default: null, trim: true },
    country: { type: String, default: "Nepal", trim: true },
  },
  { _id: false }
);
