"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const axios = require("axios");
const { fetchGoogleRouteOptions } = require("../../services/googleRoutesClient.js");
const {
  resolveGoogleGuidancePlaces, searchGoogleGuidancePlaces,
} = require("../../services/googleRouteGuidancePlaces.js");
const {
  resolveGuidanceStops,
} = require("../../src/modules/admin/platform-registry/variant-draft-workflow/route-guidance.policy.js");

const ORIGIN_ID = "64b000000000000000000001";
const DESTINATION_ID = "64b000000000000000000002";
const VIA_ID = "64b000000000000000000003";

test("route guidance preserves requested stop order and requires usable map positions", async () => {
  const stops = [{
    _id: VIA_ID,
    name: "Bardibas",
    status: "ACTIVE",
    verificationStatus: "VERIFIED",
    coordinates: { lat: 26.99, lng: 85.89 },
  }];
  const result = await resolveGuidanceStops([VIA_ID], {
    origin: { _id: ORIGIN_ID }, destination: { _id: DESTINATION_ID },
  }, { find: () => ({ lean: async () => stops }) });
  assert.equal(result[0].name, "Bardibas");

  await assert.rejects(resolveGuidanceStops([ORIGIN_ID], {
    origin: { _id: ORIGIN_ID }, destination: { _id: DESTINATION_ID },
  }, {}), (error) => error.code === "INVALID_ROUTE_GUIDANCE");
});

test("Google route guidance uses pass-through waypoints and disables alternatives", async () => {
  const originalPost = axios.post;
  const originalKey = process.env.GOOGLE_MAPS_API_KEY;
  let requestBody;
  process.env.GOOGLE_MAPS_API_KEY = "test-key";
  axios.post = async (_url, body) => {
    requestBody = body;
    return { data: { routes: [{
      distanceMeters: 1000,
      duration: "600s",
      polyline: { encodedPolyline: "??_ibE?_ibE" },
    }] } };
  };
  try {
    await fetchGoogleRouteOptions(
      { lat: 27.7, lng: 85.3 },
      { lat: 26.8, lng: 85.9 },
      { via: [{ lat: 27, lng: 85.5 }] }
    );
    assert.equal(requestBody.computeAlternativeRoutes, false);
    assert.equal(requestBody.intermediates[0].via, true);
  } finally {
    axios.post = originalPost;
    if (originalKey === undefined) delete process.env.GOOGLE_MAPS_API_KEY;
    else process.env.GOOGLE_MAPS_API_KEY = originalKey;
  }
});

test("guidance place search and resolution remain server-side and place-ID based", async () => {
  const rawPlace = {
    id: "google-bardibas",
    displayName: { text: "Bardibas" },
    formattedAddress: "Bardibas, Nepal",
    location: { latitude: 26.99, longitude: 85.89 },
  };
  const search = await searchGoogleGuidancePlaces("Bardibas", {
    key: "test", request: async (_url, body) => {
      assert.match(body.textQuery, /Bardibas, Nepal/);
      return { data: { places: [rawPlace] } };
    },
  });
  assert.equal(search[0].placeId, "google-bardibas");
  const resolved = await resolveGoogleGuidancePlaces(["google-bardibas"], {
    key: "test", request: async (url) => {
      assert.match(url, /google-bardibas$/);
      return { data: rawPlace };
    },
  });
  assert.equal(resolved[0].name, "Bardibas");
});
