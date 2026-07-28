"use strict";

const Stop = require("../../../../models/stopModel.js");
const {
  geocodeAdminBoundaries,
  findNearbyStop,
} = require("./stop-geography.service.js");

const boundaryUpdate = (stop, boundaries) => ({
  ...(boundaries.province &&
    !stop.province && { province: boundaries.province }),
  ...(boundaries.district &&
    !stop.district && { district: boundaries.district }),
  ...(boundaries.municipality &&
    !stop.municipality && { municipality: boundaries.municipality }),
});

const fillBoundaries = async (stop, boundaries) => {
  const update = boundaryUpdate(stop, boundaries);
  if (Object.keys(update).length) {
    await Stop.findByIdAndUpdate(stop._id, { $set: update });
  }
};

const findNameMatch = async (candidateName, boundaries, requireUnique) => {
  const nameLower = candidateName.toLowerCase();
  let matches = await Stop.find({ _nameLower: nameLower })
    .select("_id name aliases district municipality province coordinates")
    .lean();
  if (matches.length === 0) {
    matches = await Stop.find({
      name: { $regex: new RegExp(`^${candidateName}$`, "i") },
    })
      .select("_id name aliases district municipality province coordinates")
      .lean();
  }
  const district = (boundaries.district || "").toLowerCase().trim();
  if (district) {
    return (
      matches.find(
        (stop) => (stop.district || "").toLowerCase().trim() === district
      ) || null
    );
  }
  if (!requireUnique) return matches[0] || null;
  return matches.length === 1 ? matches[0] : null;
};

const findAliasMatch = (candidateName) =>
  Stop.findOne({
    aliases: {
      $elemMatch: { $regex: new RegExp(`^${candidateName}$`, "i") },
    },
  })
    .select("_id name aliases district municipality province")
    .lean();

const matchCandidateStop = async (candidateName, coordinates) => {
  const name = candidateName.trim();
  const hasCoordinates = Boolean(coordinates?.lat && coordinates?.lng);
  const boundaries = hasCoordinates
    ? await geocodeAdminBoundaries(coordinates.lat, coordinates.lng)
    : { province: "", district: "", municipality: "" };
  if (hasCoordinates) {
    const nearby = await findNearbyStop(coordinates.lat, coordinates.lng);
    if (nearby) {
      const canonical = nearby.stop.name.toLowerCase();
      const aliases = (nearby.stop.aliases || []).map((alias) =>
        alias.toLowerCase()
      );
      if (name.toLowerCase() !== canonical && !aliases.includes(name.toLowerCase())) {
        await Stop.findByIdAndUpdate(nearby.stop._id, {
          $addToSet: { aliases: name },
        });
      }
      await fillBoundaries(nearby.stop, boundaries);
      return {
        stopId: nearby.stop._id,
        matchType: "PROXIMITY",
        matchedName: nearby.stop.name,
      };
    }
  }
  const nameMatch = await findNameMatch(name, boundaries, true);
  if (nameMatch) {
    await fillBoundaries(nameMatch, boundaries);
    return {
      stopId: nameMatch._id,
      matchType: "NAME_DISTRICT",
      matchedName: nameMatch.name,
    };
  }
  const aliasMatch = await findAliasMatch(name);
  if (!aliasMatch) return null;
  return {
    stopId: aliasMatch._id,
    matchType: "ALIAS",
    matchedName: aliasMatch.name,
  };
};

module.exports = {
  boundaryUpdate,
  fillBoundaries,
  findNameMatch,
  findAliasMatch,
  matchCandidateStop,
};
