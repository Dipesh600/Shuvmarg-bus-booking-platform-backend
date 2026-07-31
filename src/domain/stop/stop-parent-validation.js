"use strict";

async function validateParentHierarchy(stopDoc, parentStopId, StopModel) {
  if (!parentStopId) return null;

  if (stopDoc && stopDoc._id && parentStopId.equals(stopDoc._id)) {
    const err = new Error("A stop cannot be its own parent.");
    err.code = "STOP_HIERARCHY_CYCLE";
    err.statusCode = 400;
    return err;
  }

  let currentParentId = parentStopId;
  const visited = new Set();
  if (stopDoc && stopDoc._id) visited.add(stopDoc._id.toString());

  while (currentParentId) {
    if (visited.has(currentParentId.toString())) {
      const err = new Error("Parent hierarchy cycle detected.");
      err.code = "STOP_HIERARCHY_CYCLE";
      err.statusCode = 400;
      return err;
    }
    visited.add(currentParentId.toString());

    const parentStop = await StopModel.findById(currentParentId)
      .select("parentStopId status")
      .lean();

    if (!parentStop) {
      const err = new Error("Assigned parent stop does not exist.");
      err.code = "INVALID_PARENT_STOP";
      err.statusCode = 400;
      return err;
    }
    if (parentStop.status !== "ACTIVE") {
      const err = new Error("A stop may only be assigned under an ACTIVE parent.");
      err.code = "INACTIVE_PARENT_STOP";
      err.statusCode = 400;
      return err;
    }
    currentParentId = parentStop.parentStopId;
  }

  return null;
}

module.exports = { validateParentHierarchy };
