"use strict";

const { SCHEMA_VERSION, LEGACY_AVAILABILITY } = require("./seat-layout-v3.constants");
const { validateSeatLayoutV3 } = require("./seat-layout-v3.validation");
const { SeatLayoutV3Error } = require("./seat-layout-v3.error");

const ROLE_NAMES = Object.freeze({
  LOWER_CABIN: "Lower cabin",
  UPPER_DECK: "Upper deck",
  LOWER_BERTH_LEVEL: "Lower berths",
  UPPER_BERTH_LEVEL: "Upper berths",
});
const LEGACY_ELEMENT_KINDS = new Set(["SEAT", "BERTH", "AISLE", "DOOR", "DRIVER"]);

function vehicleCategory(busShape) {
  return busShape === "MINI" ? "MINIBUS" : "BUS";
}

function passengerKind(cell) {
  return String(cell.seatType || "").startsWith("SLEEPER") ? "BERTH" : "SEAT";
}

function attributes(cell) {
  const type = cell.seatType || "STANDARD";
  return {
    comfort: type === "SEMI_SLEEPER" ? "SEMI_SLEEPER"
      : type === "SOFA" ? "RECLINING" : "STANDARD",
    commercialClass: type === "SOFA" ? "PREMIUM"
      : type === "PRIORITY" ? "PRIORITY" : "STANDARD",
    accessible: false,
  };
}

function elementId(cell, floorIndex, rowIndex) {
  const persisted = String(cell.seatId || "").trim();
  return persisted || `legacy-${floorIndex}-${rowIndex}-${cell.colIndex}-${cell.cellType}`;
}

function adaptCell(cell, floorIndex, rowIndex) {
  if (!cell || cell.cellType === "EMPTY") return null;
  const reservable = cell.cellType === "SEAT";
  const kind = reservable ? passengerKind(cell) : cell.cellType;
  if (!LEGACY_ELEMENT_KINDS.has(kind)) return null;
  const sleeper = kind === "BERTH";
  return {
    elementId: elementId(cell, floorIndex, rowIndex),
    kind,
    label: reservable ? String(cell.seatLabel || cell.seatId || "").trim() : null,
    position: { x: Number(cell.colIndex), y: Number(rowIndex) },
    size: {
      width: Number(cell.colSpan || 1),
      height: Number(cell.rowSpan || (sleeper ? 2 : 1)),
    },
    ...(reservable ? { attributes: attributes(cell) } : {}),
  };
}

function sectionRole(busShape, floorIndex, elements) {
  if (busShape === "SLEEPER_COACH") {
    return floorIndex === 0 ? "LOWER_BERTH_LEVEL" : "UPPER_BERTH_LEVEL";
  }
  if (floorIndex === 0) return "LOWER_CABIN";
  const passengerElements = elements.filter((element) => ["SEAT", "BERTH"].includes(element.kind));
  return passengerElements.length && passengerElements.every((element) => element.kind === "BERTH")
    ? "UPPER_BERTH_LEVEL" : "UPPER_DECK";
}

function adaptFloor(floor, busShape, position) {
  const floorIndex = Number.isInteger(floor?.floorIndex) ? floor.floorIndex : position;
  const elements = (floor?.rows || []).flatMap((row, rowPosition) => {
    const rowIndex = Number.isInteger(row?.rowIndex) ? row.rowIndex : rowPosition;
    return (row?.cells || []).map((cell) => adaptCell(cell, floorIndex, rowIndex)).filter(Boolean);
  });
  const widthUnits = Math.max(1, ...elements.map((item) => item.position.x + item.size.width));
  const heightUnits = Math.max(1, ...elements.map((item) => item.position.y + item.size.height));
  const role = sectionRole(busShape, floorIndex, elements);
  return {
    sectionId: `legacy-section-${floorIndex}`,
    name: ROLE_NAMES[role], role, order: position, widthUnits, heightUnits, elements,
  };
}

function adaptLegacySeatLayout(value) {
  if (!value || typeof value !== "object" || !Array.isArray(value.floors)) {
    throw new SeatLayoutV3Error("Legacy seat layout must contain floors.", "seatConfig.floors");
  }
  const sections = value.floors.map((floor, index) => adaptFloor(floor, value.busShape, index));
  const candidate = {
    schemaVersion: SCHEMA_VERSION,
    vehicleCategory: vehicleCategory(value.busShape),
    sections,
  };
  const { layout, totalPlaces } = validateSeatLayoutV3(candidate);
  const initialAvailability = value.floors.flatMap((floor, floorPosition) => {
    const floorIndex = Number.isInteger(floor?.floorIndex) ? floor.floorIndex : floorPosition;
    return (floor?.rows || []).flatMap((row, rowPosition) => {
      const rowIndex = Number.isInteger(row?.rowIndex) ? row.rowIndex : rowPosition;
      return (row?.cells || []).filter((cell) => cell?.cellType === "SEAT").map((cell) => ({
        elementId: elementId(cell, floorIndex, rowIndex),
        status: cell.isActive === false ? LEGACY_AVAILABILITY.WITHDRAWN : LEGACY_AVAILABILITY.OPEN,
      }));
    });
  });
  return { layout, totalPlaces, initialAvailability };
}

module.exports = { adaptLegacySeatLayout };
