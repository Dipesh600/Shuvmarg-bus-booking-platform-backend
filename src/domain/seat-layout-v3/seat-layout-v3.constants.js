"use strict";

const SCHEMA_VERSION = 3;

const VEHICLE_CATEGORIES = new Set(["BUS", "MINIBUS", "HIACE"]);
const SECTION_ROLES = new Set([
  "LOWER_CABIN",
  "UPPER_DECK",
  "LOWER_BERTH_LEVEL",
  "UPPER_BERTH_LEVEL",
]);
const ELEMENT_KINDS = new Set(["SEAT", "BERTH", "AISLE", "DOOR", "DRIVER"]);
const COMFORT_TYPES = new Set(["STANDARD", "RECLINING", "SEMI_SLEEPER"]);
const COMMERCIAL_CLASSES = new Set(["STANDARD", "PREMIUM", "PRIORITY"]);

const LIMITS = Object.freeze({
  sections: 4,
  sectionWidth: 10,
  sectionHeight: 40,
  elements: 160,
  totalElements: 240,
  passengerPlaces: 100,
  elementSpan: 4,
  labelLength: 20,
  nameLength: 80,
});

const LEGACY_AVAILABILITY = Object.freeze({
  OPEN: "OPEN",
  WITHDRAWN: "WITHDRAWN",
});

module.exports = {
  SCHEMA_VERSION,
  VEHICLE_CATEGORIES,
  SECTION_ROLES,
  ELEMENT_KINDS,
  COMFORT_TYPES,
  COMMERCIAL_CLASSES,
  LIMITS,
  LEGACY_AVAILABILITY,
};
