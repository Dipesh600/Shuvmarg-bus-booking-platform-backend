"use strict";

const BUS_SHAPES = new Set([
  "SINGLE_DECKER", "DOUBLE_DECKER", "SLEEPER_COACH", "MINI",
]);
const CELL_TYPES = new Set(["SEAT", "AISLE", "EMPTY", "DRIVER", "DOOR"]);
const SEAT_TYPES = new Set([
  "STANDARD", "SLEEPER_LOWER", "SLEEPER_UPPER",
  "SEMI_SLEEPER", "SOFA", "PRIORITY",
]);
const LIMITS = Object.freeze({ floors: 2, rowsPerFloor: 40, cellsPerRow: 8, seats: 120 });

module.exports = { BUS_SHAPES, CELL_TYPES, SEAT_TYPES, LIMITS };
