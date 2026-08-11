"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const axios = require("axios");
const { discoverStopsAlongRoute } = require("../../services/googlePlacesClient.js");
const {
  FIELD_MASK, TRANSIT_QUERIES, searchTransitPlacesAlongRoute,
} = require("../../services/googlePlacesSearchAlongRoute.js");
const { sampleZoneAware } = require("../../services/googlePlacesRouteSampling.js");

test("sample cap preserves dense first and last 40 km coverage", () => {
  const coordinates = Array.from({ length: 201 }, (_, index) => [85 + index * 0.01, 27]);
  const samples = sampleZoneAware(coordinates, 200, 48);
  const originCount = samples.filter((sample) => sample.km <= 40).length;
  const destinationCount = samples.filter((sample) => sample.km >= 160).length;
  const middleCount = samples.length - originCount - destinationCount;

  assert.ok(originCount >= 17);
  assert.ok(destinationCount >= 17);
  assert.ok(middleCount <= 12);
  assert.ok(samples.length <= 48);
});

test("normal route review budget has no large endpoint-zone sampling gaps", () => {
  const coordinates = Array.from({ length: 241 }, (_, index) => [85 + index * 0.01, 27]);
  const samples = sampleZoneAware(coordinates, 240, 80);
  const origin = samples.filter((sample) => sample.km <= 40);
  const destination = samples.filter((sample) => sample.km >= 200);
  const maxGap = (values) => Math.max(...values.slice(1).map((sample, index) =>
    sample.km - values[index].km
  ));

  assert.ok(origin.length >= 28);
  assert.ok(destination.length >= 28);
  assert.ok(maxGap(origin) <= 1.7);
  assert.ok(maxGap(destination) <= 1.7);
});

test("Google place search follows the reviewed polyline and deduplicates Place IDs", async () => {
  const calls = [];
  const places = await searchTransitPlacesAlongRoute("encoded-route", {
    apiKey: "test-key",
    request: async (url, body, config) => {
      calls.push({ url, body, config });
      return { data: { places: [{
        id: "place-1", displayName: { text: "Kalanki Bus Stop" },
        formattedAddress: "Kalanki, Kathmandu",
        location: { latitude: 27.69, longitude: 85.28 },
        types: ["bus_stop"],
        addressComponents: [
          { longText: "Bagmati Province", types: ["administrative_area_level_1"] },
          { longText: "Kathmandu", types: ["administrative_area_level_2"] },
          { longText: "Kathmandu Metropolitan City", types: ["administrative_area_level_3"] },
        ],
      }] } };
    },
  });

  assert.equal(calls.length, TRANSIT_QUERIES.length);
  assert.equal(calls[0].body.searchAlongRouteParameters.polyline.encodedPolyline, "encoded-route");
  assert.equal(calls[0].body.includedType, "bus_station");
  assert.equal(calls[0].body.strictTypeFiltering, true);
  assert.match(calls[0].config.headers["X-Goog-FieldMask"], /places\.id/);
  assert.equal(places.length, 1);
  assert.equal(places[0].source, "SEARCH_ALONG_ROUTE");
  assert.deepEqual(places[0].googleTypes, ["bus_stop"]);
  assert.match(FIELD_MASK, /places\.addressComponents/);
  assert.deepEqual(places[0].administrativeContext, {
    province: "Bagmati Province",
    district: "Kathmandu",
    municipality: "Kathmandu Metropolitan City",
  });
});

test("reverse geocode prefers passenger locality over broad city endpoint", async () => {
  const originalKey = process.env.GOOGLE_MAPS_API_KEY;
  const originalGet = axios.get;
  process.env.GOOGLE_MAPS_API_KEY = "test-key";
  axios.get = async () => ({
    data: {
      status: "OK",
      results: [{
        place_id: "place-koteshwor",
        formatted_address: "Koteshwor, Kathmandu 44600, Nepal",
        address_components: [
          { long_name: "Koteshwor", types: ["sublocality_level_1", "sublocality", "political"] },
          { long_name: "Kathmandu", types: ["locality", "political"] },
          { long_name: "Kathmandu", types: ["administrative_area_level_2", "political"] },
          { long_name: "Bagmati Province", types: ["administrative_area_level_1", "political"] },
        ],
      }],
    },
  });

  try {
    const suggestions = await discoverStopsAlongRoute({
      type: "LineString",
      coordinates: [[85.34, 27.68], [85.35, 27.68]],
    }, 1, 3, "Kathmandu", "Malangwa", { maxSamples: 1 });

    assert.equal(suggestions.length, 1);
    assert.equal(suggestions[0].candidateName, "Koteshwor");
    assert.equal(suggestions[0].formattedAddress, "Koteshwor, Kathmandu 44600, Nepal");
  } finally {
    axios.get = originalGet;
    if (originalKey === undefined) delete process.env.GOOGLE_MAPS_API_KEY;
    else process.env.GOOGLE_MAPS_API_KEY = originalKey;
  }
});
