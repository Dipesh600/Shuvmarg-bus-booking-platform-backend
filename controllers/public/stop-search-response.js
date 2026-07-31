"use strict";

function shapeStopSearchResult(stop) {
  return {
    id: stop._id,
    name: stop.name,
    code: stop.code,
    type: stop.type,
    province: stop.province || null,
    municipality: stop.municipality || null,
    district: stop.district || null,
    parentStop: stop.parentStopId
      ? {
          id: stop.parentStopId._id,
          name: stop.parentStopId.name,
        }
      : null,
  };
}

function escapeSearchRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

module.exports = {
  shapeStopSearchResult,
  escapeSearchRegex,
};
