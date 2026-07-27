"use strict";

function createLedgerIdConverter(mongoose) {
  return (value) =>
    typeof value === "string" ? new mongoose.Types.ObjectId(value) : value;
}

module.exports = { createLedgerIdConverter };
