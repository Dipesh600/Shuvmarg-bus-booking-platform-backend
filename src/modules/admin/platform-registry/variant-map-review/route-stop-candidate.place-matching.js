"use strict";
const { metersBetween } = require("./route-stop-candidate.geometry.js");
const { normalizePlaceName } = require("./route-stop-candidate.registry.js");
const TRANSIT_WORDS = new Set([
  "bus", "station", "stand", "stop", "park", "park", "terminal", "bay",
  "gate", "counter", "pickup", "drop", "point", "yatayat",
]);
function serviceAreaStem(value) {
  return normalizePlaceName(value).split(" ").filter((word) => !TRANSIT_WORDS.has(word)).join(" ");
}
function serviceAreaDisplayName(value) {
  const cleaned = String(value || "")
    .replace(/\bbus\s*(station|stand|stop|park)\b/gi, " ")
    .replace(/\bbuspark\b|\bterminal\b|\bgate\b|\bbay\b|\bcounter\b/gi, " ")
    .replace(/[()\[\]_-]+/g, " ").replace(/\s+/g, " ").trim();
  const normalized = normalizePlaceName(cleaned);
  const generic = new Set(["nepal", "tourist", "the tourist", "yatayat", "transport", "travels"]);
  if (normalized.length < 3 || generic.has(normalized)) return null;
  if ([...generic].some((word) => normalized === word || normalized.endsWith(` ${word}`))) return null;
  return cleaned;
}
function editDistance(left, right) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    let diagonal = previous[0];
    previous[0] = row;
    for (let column = 1; column <= right.length; column += 1) {
      const above = previous[column];
      previous[column] = Math.min(
        previous[column] + 1,
        previous[column - 1] + 1,
        diagonal + (left[row - 1] === right[column - 1] ? 0 : 1)
      );
      diagonal = above;
    }
  }
  return previous[right.length];
}
function stopNames(stop) {
  return [stop.name, ...(stop.aliases || [])].map(normalizePlaceName).filter(Boolean);
}
function matchScore(place, stop) {
  const stem = serviceAreaStem(place.providerSnapshot?.displayName);
  const searchable = normalizePlaceName([
    place.providerSnapshot?.displayName,
    place.providerSnapshot?.formattedAddress,
  ].filter(Boolean).join(" "));
  return stopNames(stop).reduce((best, name) => {
    if (stem && stem === name) return Math.min(best, 0);
    if (name.length >= 4 && searchable.split(" ").includes(name)) return Math.min(best, 1);
    if (stem.length >= 5 && name.length >= 5 && editDistance(stem, name) <= 2) return Math.min(best, 2);
    return best;
  }, Number.POSITIVE_INFINITY);
}
function reconcileTransitPlaces(places, canonicalStops, maxDistanceMeters = 5_000) {
  const serviceAreaSuggestions = [];
  const transitPlaces = places.filter((place) =>
    place.providerSnapshot?.discoveryMethod === "SEARCH_ALONG_ROUTE"
  );
  const annotatedPlaces = places.map((place) => {
    const match = canonicalStops.reduce((best, entry) => {
      const score = matchScore(place, entry.stop);
      if (!Number.isFinite(score)) return best;
      const distanceMeters = metersBetween(place.coordinates, entry.stop.coordinates);
      if (distanceMeters > maxDistanceMeters) return best;
      if (!best || score < best.score || (score === best.score && distanceMeters < best.distanceMeters)) {
        return { entry, score, distanceMeters };
      }
      return best;
    }, null);
    if (place.providerSnapshot?.discoveryMethod === "REVERSE_GEOCODE") {
      const displayName = serviceAreaDisplayName(place.providerSnapshot?.displayName);
      if (displayName) {
        const stem = serviceAreaStem(displayName);
        const corroborated = transitPlaces.some((transit) => {
          const distanceMeters = metersBetween(place.coordinates, transit.coordinates);
          if (distanceMeters > 3_000) return false;
          const transitText = normalizePlaceName([
            transit.providerSnapshot?.displayName,
            transit.providerSnapshot?.formattedAddress,
          ].filter(Boolean).join(" "));
          return stem.length >= 4 && transitText.includes(stem);
        });
        serviceAreaSuggestions.push({
          ...place,
          providerSnapshot: { ...place.providerSnapshot, provider: "GOOGLE_PLACES", displayName },
          classification: {
            entityType: match ? "ROUTE_STOP" : "SERVICE_AREA",
            confidence: match ? "MEDIUM" : "LOW",
            reasonCodes: [
              "REPEATED_ROUTE_LOCALITY_OBSERVATION",
              ...(match ? ["CANONICAL_IDENTITY_MATCH"] : []),
              ...(corroborated ? ["TRANSIT_EVIDENCE_CORROBORATED"] : []),
            ],
            suggestedParentStopId: null,
          },
          matchedStopId: match?.entry.stop._id || null,
          reviewStatus: "UNREVIEWED",
        });
      }
      // Reverse-geocoded observations are evidence, not boarding locations.
      return null;
    }
    const inferredName = serviceAreaDisplayName(place.providerSnapshot?.displayName);
    if (inferredName) {
      serviceAreaSuggestions.push({
        ...place,
        providerSnapshot: { ...place.providerSnapshot, displayName: match?.entry.stop.name || inferredName },
        classification: {
          entityType: match ? "ROUTE_STOP" : "SERVICE_AREA",
          confidence: match ? "HIGH" : "MEDIUM",
          reasonCodes: [
            "TRANSIT_PLACE_SERVICE_AREA_INFERENCE",
            ...(match ? ["CANONICAL_IDENTITY_MATCH"] : []),
          ],
          suggestedParentStopId: null,
        },
        matchedStopId: match?.entry.stop._id || null,
        reviewStatus: "UNREVIEWED",
      });
    }
    if (!match) {
      return {
        ...place,
        classification: {
          entityType: "BOARDING_LOCATION", confidence: "LOW",
          reasonCodes: ["GOOGLE_TRANSIT_PLACE", "NO_CANONICAL_ROUTE_STOP_NEARBY"],
          suggestedParentStopId: null,
        },
        reviewStatus: "EXCLUDE",
      };
    }
    return {
      ...place,
      classification: {
        entityType: "BOARDING_LOCATION", confidence: match.score === 0 ? "HIGH" : "MEDIUM",
        reasonCodes: ["GOOGLE_TRANSIT_PLACE", "NEAR_CANONICAL_ROUTE_STOP"],
        suggestedParentStopId: match.entry.stop._id,
      },
      reviewStatus: "EXCLUDE",
    };
  });
  return {
    annotatedPlaces: annotatedPlaces.filter(Boolean),
    serviceAreaSuggestions,
  };
}
module.exports = { editDistance, reconcileTransitPlaces, serviceAreaDisplayName, serviceAreaStem };
