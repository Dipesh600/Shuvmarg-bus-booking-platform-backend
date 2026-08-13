"use strict";

const {
  ELEMENT_KINDS, COMFORT_TYPES, COMMERCIAL_CLASSES, LIMITS,
} = require("./seat-layout-v3.constants");
const {
  fail, plainObject, strictKeys, text, integer, enumValue, unique,
} = require("./seat-layout-v3.validation-helpers");

const ELEMENT_KEYS = new Set(["elementId", "kind", "label", "position", "size", "attributes"]);
const POSITION_KEYS = new Set(["x", "y"]);
const SIZE_KEYS = new Set(["width", "height"]);
const ATTRIBUTE_KEYS = new Set(["comfort", "commercialClass", "accessible"]);
const RESERVABLE = new Set(["SEAT", "BERTH"]);

function validateAttributes(value, path) {
  const input = plainObject(value || {}, path);
  strictKeys(input, ATTRIBUTE_KEYS, path);
  if (input.accessible != null && typeof input.accessible !== "boolean") {
    fail(`${path}.accessible must be boolean.`, `${path}.accessible`);
  }
  return {
    comfort: enumValue(input.comfort || "STANDARD", COMFORT_TYPES, `${path}.comfort`),
    commercialClass: enumValue(
      input.commercialClass || "STANDARD", COMMERCIAL_CLASSES, `${path}.commercialClass`
    ),
    accessible: input.accessible === true,
  };
}

function validateElement(input, path, state, bounds) {
  const element = plainObject(input, path);
  strictKeys(element, ELEMENT_KEYS, path);
  const elementId = text(element.elementId, `${path}.elementId`, LIMITS.nameLength);
  unique(elementId, state.elementIds, `${path}.elementId`, "Element ID");
  const kind = enumValue(element.kind, ELEMENT_KINDS, `${path}.kind`);
  const position = plainObject(element.position, `${path}.position`);
  const size = plainObject(element.size, `${path}.size`);
  strictKeys(position, POSITION_KEYS, `${path}.position`);
  strictKeys(size, SIZE_KEYS, `${path}.size`);
  const x = integer(position.x, `${path}.position.x`, 0, bounds.width - 1);
  const y = integer(position.y, `${path}.position.y`, 0, bounds.height - 1);
  const width = integer(size.width, `${path}.size.width`, 1, LIMITS.elementSpan);
  const height = integer(size.height, `${path}.size.height`, 1, LIMITS.elementSpan);
  if (x + width > bounds.width || y + height > bounds.height) {
    fail(`${path} extends outside its section.`, `${path}.size`);
  }
  if (kind === "SEAT" && (width !== 1 || height !== 1)) {
    fail(`${path} seats must occupy one grid unit.`, `${path}.size`);
  }
  if (kind === "BERTH" && width === 1 && height === 1) {
    fail(`${path} berths must be visibly longer than a seat.`, `${path}.size`);
  }
  const reservable = RESERVABLE.has(kind);
  const label = reservable
    ? text(element.label, `${path}.label`, LIMITS.labelLength)
    : element.label == null ? null : text(element.label, `${path}.label`, LIMITS.labelLength);
  if (reservable) {
    unique(label, state.labels, `${path}.label`, "Passenger label");
    state.reservable += 1;
  }
  if (!reservable && element.attributes != null) {
    fail(`${path}.attributes only apply to seats and berths.`, `${path}.attributes`);
  }
  return {
    elementId, kind, label, position: { x, y }, size: { width, height },
    ...(reservable ? { attributes: validateAttributes(element.attributes, `${path}.attributes`) } : {}),
  };
}

module.exports = { validateElement };
