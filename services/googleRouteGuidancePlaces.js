"use strict";

const axios = require("axios");

const SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";
const PLACE_URL = "https://places.googleapis.com/v1/places";
const FIELD_MASK = "places.id,places.displayName,places.formattedAddress,places.location";
const DETAILS_MASK = "id,displayName,formattedAddress,location";

function apiKey() {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) throw new Error("GOOGLE_MAPS_API_KEY is not configured.");
  return key;
}

function mapPlace(place) {
  if (!place?.id) return null;
  return {
    placeId: place.id,
    name: place.displayName?.text || place.formattedAddress || "Mapped place",
    address: place.formattedAddress || null,
    coordinates: { lat: place.location?.latitude, lng: place.location?.longitude },
  };
}

async function searchGoogleGuidancePlaces(query, dependencies = {}) {
  const text = typeof query === "string" ? query.trim() : "";
  if (text.length < 2 || text.length > 80) throw new Error("Search with 2 to 80 characters.");
  const response = await (dependencies.request || axios.post)(SEARCH_URL, {
    textQuery: `${text}, Nepal`, languageCode: "en", regionCode: "NP", pageSize: 8,
  }, {
    headers: { "X-Goog-Api-Key": dependencies.key || apiKey(), "X-Goog-FieldMask": FIELD_MASK },
    timeout: 10_000,
  });
  return (response.data?.places || []).map(mapPlace).filter(Boolean);
}

async function resolveGoogleGuidancePlaces(placeIds, dependencies = {}) {
  if (!Array.isArray(placeIds) || placeIds.length > 3 ||
      placeIds.some((id) => typeof id !== "string" || !id.trim())) {
    throw new Error("Choose no more than three valid Google places.");
  }
  return Promise.all([...new Set(placeIds)].map(async (placeId) => {
    const response = await (dependencies.request || axios.get)(
      `${PLACE_URL}/${encodeURIComponent(placeId)}`,
      {
        params: { languageCode: "en", regionCode: "NP" },
        headers: { "X-Goog-Api-Key": dependencies.key || apiKey(), "X-Goog-FieldMask": DETAILS_MASK },
        timeout: 8_000,
      }
    );
    const place = mapPlace(response.data);
    if (!place || !Number.isFinite(place.coordinates.lat) || !Number.isFinite(place.coordinates.lng)) {
      throw new Error("Google returned a guidance place without a usable map position.");
    }
    return place;
  }));
}

module.exports = { mapPlace, resolveGoogleGuidancePlaces, searchGoogleGuidancePlaces };
