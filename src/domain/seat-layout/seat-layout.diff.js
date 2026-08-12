"use strict";

const { validateSeatLayout } = require("./seat-layout.validation");

function seats(config) {
  const layout = validateSeatLayout(config).seatConfig;
  const result = new Map();
  for (const floor of layout.floors) {
    for (const row of floor.rows) {
      for (const cell of row.cells) {
        if (cell.cellType !== "SEAT") continue;
        result.set(cell.seatId.toLowerCase(), {
          id: cell.seatId,
          label: cell.seatLabel,
          active: cell.isActive !== false,
          floor: floor.floorIndex,
          row: row.rowIndex,
          column: cell.colIndex,
          type: cell.seatType || "STANDARD",
          rowSpan: cell.rowSpan || 1,
          colSpan: cell.colSpan || 1,
        });
      }
    }
  }
  return result;
}

function changed(before, after) {
  return before.label !== after.label || before.active !== after.active ||
    before.floor !== after.floor || before.row !== after.row ||
    before.column !== after.column || before.type !== after.type ||
    before.rowSpan !== after.rowSpan || before.colSpan !== after.colSpan;
}

function diffSeatLayouts(currentConfig, proposedConfig) {
  const current = seats(currentConfig);
  const proposed = seats(proposedConfig);
  const added = [...proposed.keys()].filter((key) => !current.has(key));
  const removed = [...current.keys()].filter((key) => !proposed.has(key));
  const modified = [...current.keys()].filter((key) =>
    proposed.has(key) && changed(current.get(key), proposed.get(key))
  );
  const removedLabels = [...new Set([
    ...removed.map((key) => current.get(key).label),
    ...modified.filter((key) => current.get(key).active).map((key) => current.get(key).label),
  ])];
  return {
    classification: removed.length || modified.length
      ? "WITHDRAWAL_OR_MODIFICATION" : "ADDITION_ONLY",
    addedSeatIds: added.map((key) => proposed.get(key).id),
    removedSeatIds: removed.map((key) => current.get(key).id),
    modifiedSeatIds: modified.map((key) => current.get(key).id),
    removedSeatLabels: removedLabels,
  };
}

module.exports = { diffSeatLayouts };
