"use strict";

const axios = require("axios");
const { googleAdministrativeContext } = require("./googlePlaceAdministrativeContext.js");

const GEOCODE_BASE = "https://maps.googleapis.com/maps/api/geocode/json";
const LOCALITY_TYPES_PRIORITY = [
  "neighborhood", "sublocality_level_4", "sublocality_level_3",
  "sublocality_level_2", "sublocality_level_1", "sublocality",
  "administrative_area_level_4", "administrative_area_level_3", "locality",
];

async function reverseGeocode(lat, lng, token) {
  const { data } = await axios.get(GEOCODE_BASE, {
    params: {
      latlng: `${lat},${lng}`,
      key: token,
      result_type: LOCALITY_TYPES_PRIORITY.join("|"),
      language: "en",
    },
    timeout: 2_500,
  });
  if (data.status === "REQUEST_DENIED") {
    throw new Error(
      `Google Geocoding API denied: ${data.error_message || "Unknown error"}. ` +
      "Enable the Geocoding API in your Google Cloud project."
    );
  }
  if (data.status === "OVER_QUERY_LIMIT") {
    throw new Error("Google Geocoding API quota exceeded. Check billing.");
  }
  if (!data.results?.length) return null;
  for (const type of LOCALITY_TYPES_PRIORITY) {
    for (const result of data.results) {
      const components = result.address_components || [];
      const component = components.find((item) => item.types.includes(type));
      if (component) return {
        name: component.long_name,
        type,
        formattedAddress: result.formatted_address || null,
        googlePlaceId: result.place_id || null,
        administrativeContext: googleAdministrativeContext(components),
      };
    }
  }
  return null;
}

async function mapWithConcurrency(values, concurrency, delayMs, worker) {
  const results = new Array(values.length);
  let cursor = 0;
  async function run() {
    while (cursor < values.length) {
      const index = cursor++;
      results[index] = await worker(values[index], index);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, run));
  return results;
}

module.exports = { reverseGeocode, mapWithConcurrency };
