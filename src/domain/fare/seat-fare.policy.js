"use strict";

function normalizeSeatFareOverrides(value) {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new Error("seatFareOverrides must be an array.");
  const labels = new Set();
  return value.map((entry, index) => {
    const seatLabel = String(entry?.seatLabel || "").trim().toUpperCase();
    const fare = Number(entry?.fare);
    if (!seatLabel) throw new Error(`seatFareOverrides[${index}].seatLabel is required.`);
    if (!Number.isFinite(fare) || fare <= 0) throw new Error(`seatFareOverrides[${index}].fare must be positive.`);
    if (labels.has(seatLabel)) throw new Error(`Seat fare for ${seatLabel} is duplicated.`);
    labels.add(seatLabel);
    return { seatLabel, fare };
  });
}

function calculateSeatTotal(baseFare, overrides, seatLabels) {
  if (!Number.isFinite(baseFare) || baseFare <= 0) return null;
  const prices = new Map(normalizeSeatFareOverrides(overrides).map((item) => [item.seatLabel, item.fare]));
  return seatLabels.reduce((total, label) => total + (prices.get(String(label).trim().toUpperCase()) || baseFare), 0);
}

module.exports = { normalizeSeatFareOverrides, calculateSeatTotal };
