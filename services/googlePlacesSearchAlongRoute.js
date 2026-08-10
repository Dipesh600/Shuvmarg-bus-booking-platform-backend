"use strict";

const axios = require("axios");
const { googleAdministrativeContext } = require("./googlePlaceAdministrativeContext.js");

const SEARCH_TEXT_URL = "https://places.googleapis.com/v1/places:searchText";
const FIELD_MASK = [
  "places.id", "places.displayName", "places.formattedAddress",
  "places.location", "places.types", "places.primaryType", "places.addressComponents",
].join(",");
const TRANSIT_QUERIES = ["bus station", "bus park", "bus stop"];

function mapPlace(place) {
  const lat = place.location?.latitude;
  const lng = place.location?.longitude;
  if (!place.id || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    candidateName: place.displayName?.text || place.formattedAddress || "Transit place",
    candidateCoordinates: { lat, lng },
    googlePlaceId: place.id,
    formattedAddress: place.formattedAddress || null,
    googleTypes: Array.isArray(place.types) ? place.types : [],
    googlePrimaryType: place.primaryType || null,
    administrativeContext: googleAdministrativeContext(place.addressComponents),
    source: "SEARCH_ALONG_ROUTE",
  };
}

async function searchTransitPlacesAlongRoute(encodedPolyline, dependencies = {}) {
  const key = dependencies.apiKey || process.env.GOOGLE_MAPS_API_KEY;
  if (!key) throw new Error("GOOGLE_MAPS_API_KEY is not configured.");
  if (typeof encodedPolyline !== "string" || !encodedPolyline.trim()) {
    throw new Error("An encoded route polyline is required for place search.");
  }
  const request = dependencies.request || axios.post;
  const placesById = new Map();
  for (const textQuery of TRANSIT_QUERIES) {
    const response = await request(SEARCH_TEXT_URL, {
      textQuery,
      searchAlongRouteParameters: { polyline: { encodedPolyline } },
      languageCode: "en",
      regionCode: "NP",
      includedType: "bus_station",
      strictTypeFiltering: true,
      pageSize: 20,
    }, {
      headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": FIELD_MASK },
      timeout: 12_000,
    });
    for (const raw of response.data?.places || []) {
      const place = mapPlace(raw);
      if (place && !placesById.has(place.googlePlaceId)) placesById.set(place.googlePlaceId, place);
    }
  }
  return [...placesById.values()];
}

module.exports = { FIELD_MASK, TRANSIT_QUERIES, mapPlace, searchTransitPlacesAlongRoute };
