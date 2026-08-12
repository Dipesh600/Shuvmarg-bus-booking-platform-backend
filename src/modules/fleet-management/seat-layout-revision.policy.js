"use strict";

const { ApiError } = require("../../contracts");
const { diffSeatLayouts } = require("../../domain/seat-layout/seat-layout.diff");

const MIN_WITHDRAWAL_NOTICE_DAYS = 7;

function validateEffectiveAt(value, now = new Date()) {
  const effectiveAt = new Date(value);
  effectiveAt.setUTCHours(0, 0, 0, 0);
  const earliest = new Date(now);
  earliest.setUTCHours(0, 0, 0, 0);
  earliest.setUTCDate(earliest.getUTCDate() + MIN_WITHDRAWAL_NOTICE_DAYS);
  if (Number.isNaN(effectiveAt.getTime()) || effectiveAt < earliest) {
    throw new ApiError("FLEET_LAYOUT_INVALID", {
      details: {
        reason: `Seat withdrawals require at least ${MIN_WITHDRAWAL_NOTICE_DAYS} full days' notice.`,
        earliestEffectiveAt: earliest.toISOString(),
      },
    });
  }
  return effectiveAt;
}

function classifyRevision(currentConfig, proposedConfig, effectiveAt, now) {
  const diff = diffSeatLayouts(currentConfig, proposedConfig);
  if (!diff.addedSeatIds.length && !diff.removedSeatIds.length && !diff.modifiedSeatIds.length) {
    throw new ApiError("FLEET_LAYOUT_INVALID", {
      details: { reason: "The proposed seat layout is unchanged." },
    });
  }
  return {
    ...diff,
    effectiveAt: diff.classification === "ADDITION_ONLY"
      ? now : validateEffectiveAt(effectiveAt, now),
  };
}

module.exports = {
  MIN_WITHDRAWAL_NOTICE_DAYS,
  validateEffectiveAt,
  classifyRevision,
};
