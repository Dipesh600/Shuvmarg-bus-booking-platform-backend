"use strict";

const {
  SCHEMA_VERSION, VEHICLE_CATEGORIES, SECTION_ROLES, LIMITS,
} = require("./seat-layout-v3.constants");
const { validateElement } = require("./seat-layout-v3.element-validation");
const {
  fail, plainObject, strictKeys, text, integer, enumValue, unique,
} = require("./seat-layout-v3.validation-helpers");

const LAYOUT_KEYS = new Set(["schemaVersion", "vehicleCategory", "sections"]);
const SECTION_KEYS = new Set([
  "sectionId", "name", "role", "order", "widthUnits", "heightUnits", "elements",
]);

function validateSection(input, position, state) {
  const path = `sections[${position}]`;
  const section = plainObject(input, path);
  strictKeys(section, SECTION_KEYS, path);
  const sectionId = text(section.sectionId, `${path}.sectionId`, LIMITS.nameLength);
  unique(sectionId, state.sectionIds, `${path}.sectionId`, "Section ID");
  const name = text(section.name, `${path}.name`, LIMITS.nameLength);
  const role = enumValue(section.role, SECTION_ROLES, `${path}.role`);
  const order = integer(section.order, `${path}.order`, 0, LIMITS.sections - 1);
  if (state.orders.has(order)) fail(`Section order ${order} is duplicated.`, `${path}.order`);
  state.orders.add(order);
  const widthUnits = integer(section.widthUnits, `${path}.widthUnits`, 1, LIMITS.sectionWidth);
  const heightUnits = integer(section.heightUnits, `${path}.heightUnits`, 1, LIMITS.sectionHeight);
  if (!Array.isArray(section.elements) || section.elements.length > LIMITS.elements) {
    fail(`${path}.elements must contain at most ${LIMITS.elements} elements.`, `${path}.elements`);
  }
  const occupied = new Set();
  const elements = section.elements.map((element, index) => {
    const validated = validateElement(element, `${path}.elements[${index}]`, state, {
      width: widthUnits, height: heightUnits,
    });
    for (let y = validated.position.y; y < validated.position.y + validated.size.height; y += 1) {
      for (let x = validated.position.x; x < validated.position.x + validated.size.width; x += 1) {
        const cell = `${x}:${y}`;
        if (occupied.has(cell)) fail(`Elements overlap at ${cell}.`, `${path}.elements[${index}]`);
        occupied.add(cell);
      }
    }
    return validated;
  });
  return { sectionId, name, role, order, widthUnits, heightUnits, elements };
}

function validateSeatLayoutV3(value) {
  const layout = structuredClone(plainObject(value, "seatLayout"));
  strictKeys(layout, LAYOUT_KEYS, "seatLayout");
  if (layout.schemaVersion !== SCHEMA_VERSION) {
    fail(`seatLayout.schemaVersion must be ${SCHEMA_VERSION}.`, "seatLayout.schemaVersion");
  }
  const vehicleCategory = enumValue(
    layout.vehicleCategory, VEHICLE_CATEGORIES, "seatLayout.vehicleCategory"
  );
  if (!Array.isArray(layout.sections) || !layout.sections.length || layout.sections.length > LIMITS.sections) {
    fail(`seatLayout.sections must contain 1 to ${LIMITS.sections} sections.`, "seatLayout.sections");
  }
  const state = {
    sectionIds: new Set(), orders: new Set(), elementIds: new Set(), labels: new Set(), reservable: 0,
  };
  const sections = layout.sections.map((section, index) => validateSection(section, index, state));
  if (Array.from({ length: sections.length }, (_, index) => index).some((index) => !state.orders.has(index))) {
    fail("Section order must be contiguous and start at zero.", "seatLayout.sections");
  }
  if (!state.reservable) fail("Seat layout must contain at least one seat or berth.", "seatLayout.sections");
  return { layout: { schemaVersion: SCHEMA_VERSION, vehicleCategory, sections }, totalPlaces: state.reservable };
}

module.exports = { validateSeatLayoutV3 };
