"use strict";

const FLEET_OPERATIONAL_STATUS = Object.freeze({
  ACTIVE: "ACTIVE",
  INACTIVE: "INACTIVE",
  MAINTENANCE: "MAINTENANCE",
});

const FLEET_OPERATIONAL_VALUES = Object.freeze(
  Object.values(FLEET_OPERATIONAL_STATUS)
);

const FLEET_OPERATIONAL_LABELS = Object.freeze({
  [FLEET_OPERATIONAL_STATUS.ACTIVE]: "Active",
  [FLEET_OPERATIONAL_STATUS.INACTIVE]: "Inactive",
  [FLEET_OPERATIONAL_STATUS.MAINTENANCE]: "Under Maintenance",
});

function isFleetOperationalStatus(value) {
  return typeof value === "string" && FLEET_OPERATIONAL_VALUES.includes(value);
}

function getFleetOperationalLabel(value) {
  if (!isFleetOperationalStatus(value)) return null;
  return FLEET_OPERATIONAL_LABELS[value] || null;
}

module.exports = {
  FLEET_OPERATIONAL_STATUS,
  FLEET_OPERATIONAL_VALUES,
  FLEET_OPERATIONAL_LABELS,
  isFleetOperationalStatus,
  getFleetOperationalLabel,
};
