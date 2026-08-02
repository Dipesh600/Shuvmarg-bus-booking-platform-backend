"use strict";

const { scanError } = require("./migration-errors");

function validateStopHierarchy(stop, stopMap) {
  const errors = [];
  if (!stop.parentStopId) return errors;

  const parentIdStr = stop.parentStopId.toString();
  const parent = stopMap.get(parentIdStr);

  if (!parent) {
    errors.push(
      scanError(stop, "INVALID_PARENT_STOP", `Parent stop ${parentIdStr} does not exist.`)
    );
  } else if (parent.status !== "ACTIVE") {
    errors.push(
      scanError(stop, "INACTIVE_PARENT_STOP", `Parent stop ${parentIdStr} is inactive.`)
    );
  } else {
    let currentParent = parent;
    const visited = new Set([stop._id.toString()]);

    while (currentParent) {
      if (visited.has(currentParent._id.toString())) {
        errors.push(scanError(stop, "STOP_HIERARCHY_CYCLE", "Hierarchy cycle detected."));
        break;
      }
      visited.add(currentParent._id.toString());
      currentParent = currentParent.parentStopId
        ? stopMap.get(currentParent.parentStopId.toString())
        : null;
    }
  }

  return errors;
}

module.exports = { validateStopHierarchy };
