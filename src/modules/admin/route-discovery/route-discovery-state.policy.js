"use strict";

const VALID_TRANSITIONS = {
  DRAFT: ["ROUTE_SELECTED", "REJECTED"],
  ROUTE_SELECTED: ["STOPS_DISCOVERED", "DRAFT", "REJECTED"],
  STOPS_DISCOVERED: ["APPROVED", "ROUTE_SELECTED", "REJECTED"],
  APPROVED: ["PUBLISHED", "STOPS_DISCOVERED", "REJECTED"],
  PUBLISHED: [],
  REJECTED: [],
};

const assertTransition = (current, next) => {
  const allowed = VALID_TRANSITIONS[current] || [];
  if (!allowed.includes(next)) {
    throw new Error(
      `Invalid status transition: ${current} → ${next}. ` +
      `Allowed from ${current}: [${allowed.join(", ") || "none"}]`
    );
  }
};

module.exports = { VALID_TRANSITIONS, assertTransition };
