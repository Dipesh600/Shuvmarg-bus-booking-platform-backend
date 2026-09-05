"use strict";

// Accept legacy persisted/input spelling, but new writes use the model enum.
const normalizeTripStatus = (status) => status === "in_transit" ? "in-transit" : status;
const TRANSITIONS = {
  scheduled: ["boarding", "cancelled"],
  boarding: ["in-transit", "cancelled"],
  "in-transit": ["completed"],
  completed: [],
  cancelled: [],
};
const canTransition = (current, next) => Boolean(
  TRANSITIONS[normalizeTripStatus(current)]?.includes(normalizeTripStatus(next))
);
module.exports = { TRANSITIONS, canTransition, normalizeTripStatus };
