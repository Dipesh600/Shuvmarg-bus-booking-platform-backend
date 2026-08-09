"use strict";

const Stop = require("../../../../models/stopModel.js");
const {
  geocodeAdminBoundaries,
  findNearbyStop,
} = require("./stop-geography.service.js");
const {
  fillBoundaries,
  findNameMatch,
  findAliasMatch,
} = require("./stop-registry.service.js");

const addAlias = async (stop, candidateName) => {
  const candidate = candidateName.toLowerCase();
  const canonical = stop.name.toLowerCase();
  const aliases = (stop.aliases || []).map((alias) => alias.toLowerCase());
  if (candidate !== canonical && !aliases.includes(candidate)) {
    await Stop.findByIdAndUpdate(stop._id, {
      $addToSet: { aliases: candidateName },
    });
  }
};

const createRegistryStop = async (
  candidateName,
  coordinates,
  boundaries,
  adminId
) => {
  const stop = await Stop.createWithUniqueCode({
    name: candidateName,
    coordinates,
    province: boundaries.province,
    district: boundaries.district,
    municipality: boundaries.municipality,
    source: "DISCOVERY",
    verificationStatus: "VERIFIED",
    status: "ACTIVE",
    isRouteStop: true,
    isSearchable: false,
    createdBy: adminId,
  });
  return stop._id;
};

const resolvePublishedStop = async (entry, adminId) => {
  if (entry.adminAction === "MERGED" && entry.mergedIntoRouteStopId) {
    return entry.mergedIntoRouteStopId;
  }
  if (entry.routeStopId) return entry.routeStopId;
  if (!entry.candidateName) {
    throw new Error(
      `Cannot publish: stop at sequence ${entry.sequenceOrder} has no name. ` +
      "Set candidateName or link to an existing stop before publishing."
    );
  }
  const candidateName = entry.candidateName.trim();
  const coordinates = entry.candidateCoordinates || {};
  const hasCoordinates = Boolean(coordinates.lat && coordinates.lng);
  if (!hasCoordinates) {
    throw new Error(
      `Cannot publish: "${candidateName}" has no verified map coordinates. ` +
      "Select an existing stop or add the location on the map."
    );
  }
  const boundaries = hasCoordinates
    ? await geocodeAdminBoundaries(coordinates.lat, coordinates.lng)
    : { province: "", district: "", municipality: "" };
  if (hasCoordinates) {
    const nearby = await findNearbyStop(coordinates.lat, coordinates.lng);
    if (nearby) {
      await addAlias(nearby.stop, candidateName);
      await fillBoundaries(nearby.stop, boundaries);
      return nearby.stop._id;
    }
  }
  const nameMatch = await findNameMatch(candidateName, boundaries, false);
  if (nameMatch) {
    await fillBoundaries(nameMatch, boundaries);
    return nameMatch._id;
  }
  const aliasMatch = await findAliasMatch(candidateName);
  if (aliasMatch) {
    await fillBoundaries(aliasMatch, boundaries);
    return aliasMatch._id;
  }
  return createRegistryStop(
    candidateName,
    coordinates,
    boundaries,
    adminId
  );
};

module.exports = { resolvePublishedStop };
