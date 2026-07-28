"use strict";

const decodePolyline = (encoded) => {
  const coordinates = [];
  let index = 0;
  let latitude = 0;
  let longitude = 0;
  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    latitude += result & 1 ? ~(result >> 1) : result >> 1;
    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    longitude += result & 1 ? ~(result >> 1) : result >> 1;
    coordinates.push([longitude / 1e5, latitude / 1e5]);
  }
  return coordinates;
};

const buildFrontendGeometry = (metadata) => {
  const stepPolylines = Array.isArray(metadata.stepPolylines)
    ? metadata.stepPolylines
    : [];
  const stepCoordinates = stepPolylines.flatMap((encoded) =>
    encoded ? decodePolyline(encoded) : []
  );
  if (stepCoordinates.length > 1) {
    console.log(
      `[Discovery] Built detailed geometry from ${stepPolylines.length} step polylines ` +
      `→ ${stepCoordinates.length} total coordinate points.`
    );
    return { type: "LineString", coordinates: stepCoordinates };
  }
  if (!metadata.encodedPolyline) return null;
  const coordinates = decodePolyline(metadata.encodedPolyline);
  if (coordinates.length <= 1) return null;
  console.log(
    `[Discovery] Using overview polyline fallback → ${coordinates.length} points.`
  );
  return { type: "LineString", coordinates };
};

module.exports = { decodePolyline, buildFrontendGeometry };
