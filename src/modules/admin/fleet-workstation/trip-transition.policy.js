"use strict";

const TRANSITIONS = {
  scheduled: ["boarding", "cancelled"],
  boarding: ["in-transit", "cancelled"],
  "in-transit": ["completed"],
  completed: [],
  cancelled: [],
};

const canTransition = (current, next) =>
  Boolean(TRANSITIONS[current]?.includes(next));

module.exports = { TRANSITIONS, canTransition };
