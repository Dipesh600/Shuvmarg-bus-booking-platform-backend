"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  FIELD_MASK, TRANSIT_QUERIES, searchTransitPlacesAlongRoute,
} = require("../../services/googlePlacesSearchAlongRoute.js");

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
