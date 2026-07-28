"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  decodePolyline,
  buildFrontendGeometry,
} = require("../../src/modules/admin/route-discovery/polyline.js");

test("route discovery polyline behavior", async (t) => {
  await t.test("decodes the canonical Google polyline", () => {
    assert.deepEqual(decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@"), [
      [-120.2, 38.5],
      [-120.95, 40.7],
      [-126.453, 43.252],
    ]);
  });
  await t.test("step geometry takes priority over overview geometry", () => {
    const geometry = buildFrontendGeometry({
      stepPolylines: ["_p~iF~ps|U_ulLnnqC", "_mqNvxq`@"],
      encodedPolyline: "_p~iF~ps|U_ulLnnqC_mqNvxq`@",
    });
    assert.equal(geometry.type, "LineString");
    assert.equal(geometry.coordinates.length, 3);
  });
  await t.test("overview geometry is the fallback", () => {
    const geometry = buildFrontendGeometry({
      encodedPolyline: "_p~iF~ps|U_ulLnnqC",
    });
    assert.equal(geometry.type, "LineString");
    assert.equal(geometry.coordinates.length, 2);
  });
  await t.test("insufficient geometry returns null", () => {
    assert.equal(buildFrontendGeometry({}), null);
    assert.equal(buildFrontendGeometry({ encodedPolyline: "_p~iF~ps|U" }), null);
  });
});
