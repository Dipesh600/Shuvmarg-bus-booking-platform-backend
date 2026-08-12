"use strict";

const { BUS_SHAPES, CELL_TYPES, SEAT_TYPES, LIMITS } = require("./seat-layout.constants");
const { SeatLayoutError } = require("./seat-layout.error");

const fail = (message, path) => {
  throw new SeatLayoutError(message, path ? { path } : null);
};
const integer = (value, path) => {
  if (!Number.isInteger(value) || value < 0) fail(`${path} must be a non-negative integer.`, path);
};
const key = (value) => String(value).trim().toLocaleLowerCase("en-US");
const plainConfig = (value) => {
  if (value?.toObject) return value.toObject({ depopulate: true });
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("Seat configuration must be an object.", "seatConfig");
  }
  return structuredClone(value);
};

function validateCell(cell, path, state) {
  if (!cell || typeof cell !== "object" || Array.isArray(cell)) fail(`${path} is invalid.`, path);
  integer(cell.colIndex, `${path}.colIndex`);
  delete cell._id;
  if (!CELL_TYPES.has(cell.cellType)) fail(`${path}.cellType is unsupported.`, `${path}.cellType`);
  if (state.columns.has(cell.colIndex)) fail(`${path}.colIndex is duplicated.`, `${path}.colIndex`);
  state.columns.add(cell.colIndex);
  if (cell.cellType !== "SEAT") {
    cell.seatId = null;
    cell.seatLabel = null;
    delete cell.rowSpan;
    delete cell.colSpan;
    return;
  }
  const seatId = String(cell.seatId || "").trim();
  const seatLabel = String(cell.seatLabel || "").trim();
  if (!seatId) fail(`${path}.seatId is required for a seat.`, `${path}.seatId`);
  if (!seatLabel) fail(`${path}.seatLabel is required for a seat.`, `${path}.seatLabel`);
  if (!SEAT_TYPES.has(cell.seatType || "STANDARD")) {
    fail(`${path}.seatType is unsupported.`, `${path}.seatType`);
  }
  if (state.seatIds.has(key(seatId))) fail(`Seat ID "${seatId}" is duplicated.`, `${path}.seatId`);
  if (state.labels.has(key(seatLabel))) fail(`Seat label "${seatLabel}" is duplicated.`, `${path}.seatLabel`);
  state.seatIds.add(key(seatId));
  state.labels.add(key(seatLabel));
  state.seats += 1;
  cell.seatId = seatId;
  cell.seatLabel = seatLabel;
  cell.seatType = cell.seatType || "STANDARD";
  cell.isActive = cell.isActive !== false;
  cell.rowSpan = cell.rowSpan == null ? 1 : cell.rowSpan;
  cell.colSpan = cell.colSpan == null ? 1 : cell.colSpan;
  if (!Number.isInteger(cell.rowSpan) || cell.rowSpan < 1 || cell.rowSpan > 2) {
    fail(`${path}.rowSpan must be 1 or 2.`, `${path}.rowSpan`);
  }
  if (!Number.isInteger(cell.colSpan) || cell.colSpan < 1 || cell.colSpan > 2) {
    fail(`${path}.colSpan must be 1 or 2.`, `${path}.colSpan`);
  }
  if ((cell.seatType === "SLEEPER_LOWER" || cell.seatType === "SLEEPER_UPPER") && cell.rowSpan < 2) {
    fail(`${path} sleeper berths must occupy two rows.`, `${path}.rowSpan`);
  }
}

function validateRows(floor, floorPath, state, totalColumns) {
  if (!Array.isArray(floor.rows) || floor.rows.length > LIMITS.rowsPerFloor) {
    fail(`${floorPath}.rows must contain at most ${LIMITS.rowsPerFloor} rows.`, `${floorPath}.rows`);
  }
  const rowIndexes = new Set();
  floor.rows.forEach((row, rowPosition) => {
    const path = `${floorPath}.rows[${rowPosition}]`;
    if (!row || typeof row !== "object" || Array.isArray(row)) fail(`${path} is invalid.`, path);
    integer(row.rowIndex, `${path}.rowIndex`);
    delete row._id;
    if (rowIndexes.has(row.rowIndex)) fail(`${path}.rowIndex is duplicated.`, `${path}.rowIndex`);
    rowIndexes.add(row.rowIndex);
    if (!Array.isArray(row.cells) || row.cells.length > LIMITS.cellsPerRow) {
      fail(`${path}.cells must contain at most ${LIMITS.cellsPerRow} cells.`, `${path}.cells`);
    }
    const rowState = { ...state, columns: new Set() };
    row.cells.forEach((cell, cellPosition) => validateCell(cell, `${path}.cells[${cellPosition}]`, rowState));
    state.seats = rowState.seats;
  });
  if (Array.from({ length: floor.rows.length }, (_, index) => index).some((index) => !rowIndexes.has(index))) {
    fail(`${floorPath}.rows must use contiguous indexes starting at zero.`, `${floorPath}.rows`);
  }
  const occupied = new Set();
  floor.rows.forEach((row, rowPosition) => {
    row.cells.forEach((cell, cellPosition) => {
      if (cell.cellType !== "SEAT") return;
      const path = `${floorPath}.rows[${rowPosition}].cells[${cellPosition}]`;
      const rowSpan = cell.rowSpan || 1;
      const colSpan = cell.colSpan || 1;
      if (row.rowIndex + rowSpan > floor.rows.length) {
        fail(`${path} extends beyond the floor.`, `${path}.rowSpan`);
      }
      if (cell.colIndex + colSpan > totalColumns) {
        fail(`${path} extends beyond the floor width.`, `${path}.colSpan`);
      }
      for (let r = row.rowIndex; r < row.rowIndex + rowSpan; r += 1) {
        for (let c = cell.colIndex; c < cell.colIndex + colSpan; c += 1) {
          const position = `${r}:${c}`;
          if (occupied.has(position)) fail(`${path} overlaps another seat or berth.`, path);
          occupied.add(position);
        }
      }
    });
  });
}

function validateSeatLayout(value) {
  const config = plainConfig(value);
  if (!BUS_SHAPES.has(config.busShape)) fail("A supported busShape is required.", "seatConfig.busShape");
  const allowedFloorCounts = config.busShape === "DOUBLE_DECKER" ? [2]
    : config.busShape === "SLEEPER_COACH" ? [1, 2] : [1];
  if (!Array.isArray(config.floors) || !allowedFloorCounts.includes(config.floors.length)) {
    fail(`${config.busShape} requires ${allowedFloorCounts.join(" or ")} floor level(s).`, "seatConfig.floors");
  }
  if (config.floors.length > LIMITS.floors) fail("Too many floors.", "seatConfig.floors");
  const inferredColumns = Math.max(1, ...config.floors.flatMap((floor) =>
    (floor?.rows || []).flatMap((row) => (row?.cells || []).map((cell) => Number(cell?.colIndex) + 1))
  ));
  config.totalColumns = config.totalColumns == null ? inferredColumns : config.totalColumns;
  if (!Number.isInteger(config.totalColumns) || config.totalColumns < 1 || config.totalColumns > LIMITS.cellsPerRow) {
    fail(`seatConfig.totalColumns must be between 1 and ${LIMITS.cellsPerRow}.`, "seatConfig.totalColumns");
  }
  const state = { seats: 0, seatIds: new Set(), labels: new Set() };
  const floorIndexes = new Set();
  config.floors.forEach((floor, position) => {
    const path = `seatConfig.floors[${position}]`;
    if (!floor || typeof floor !== "object" || Array.isArray(floor)) fail(`${path} is invalid.`, path);
    integer(floor.floorIndex, `${path}.floorIndex`);
    delete floor._id;
    if (floorIndexes.has(floor.floorIndex)) fail(`${path}.floorIndex is duplicated.`, `${path}.floorIndex`);
    floorIndexes.add(floor.floorIndex);
    validateRows(floor, path, state, config.totalColumns);
  });
  const expectedIndexes = Array.from({ length: config.floors.length }, (_, index) => index);
  if (expectedIndexes.some((index) => !floorIndexes.has(index))) {
    fail("Floor indexes must be contiguous and start at zero.", "seatConfig.floors");
  }
  if (state.seats < 1 || state.seats > LIMITS.seats) {
    fail(`Seat layout must contain between 1 and ${LIMITS.seats} seats.`, "seatConfig.floors");
  }
  return { seatConfig: config, totalSeats: state.seats };
}

function seatLayoutFingerprint(value) {
  const { seatConfig } = validateSeatLayout(value);
  return JSON.stringify({
    busShape: seatConfig.busShape,
    floors: seatConfig.floors.map((floor) => ({
      floorIndex: floor.floorIndex,
      rows: floor.rows.map((row) => ({
        rowIndex: row.rowIndex,
        rowType: row.rowType || "SEAT_ROW",
        cells: row.cells.map((cell) => ({
          colIndex: cell.colIndex,
          cellType: cell.cellType,
          seatId: cell.seatId,
          seatLabel: cell.seatLabel,
          seatType: cell.seatType || "STANDARD",
          isActive: cell.isActive !== false,
          rowSpan: cell.rowSpan || 1,
          colSpan: cell.colSpan || 1,
        })),
      })),
    })),
  });
}

module.exports = { validateSeatLayout, seatLayoutFingerprint };
