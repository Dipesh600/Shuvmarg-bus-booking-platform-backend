"use strict";

const axios = require("axios");
const Stop = require("../../../../models/stopModel.js");

const geocodeAdminBoundaries = async (lat, lng) => {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key || !lat || !lng) {
    return { province: "", district: "", municipality: "" };
  }
  try {
    const { data } = await axios.get(
      "https://maps.googleapis.com/maps/api/geocode/json",
      { params: { latlng: `${lat},${lng}`, key }, timeout: 8_000 }
    );
    if (data.status !== "OK" || !data.results?.length) {
      return { province: "", district: "", municipality: "" };
    }
    let province = "";
    let district = "";
    let municipality = "";
    const components = data.results[0].address_components || [];
    for (const component of components) {
      if (
        component.types.includes("administrative_area_level_1") &&
        !province
      ) {
        province = component.long_name.replace(/ Province$/i, "").trim();
      }
      if (
        component.types.includes("administrative_area_level_2") &&
        !district
      ) {
        district = component.long_name.replace(/ District$/i, "").trim();
      }
      if (
        (component.types.includes("locality") ||
          component.types.includes("sublocality")) &&
        !municipality
      ) {
        municipality = component.long_name.trim();
      }
    }
    if (!district) {
      const fallback = components.find((component) =>
        component.types.includes("administrative_area_level_3")
      );
      if (fallback) {
        district = fallback.long_name.replace(/ District$/i, "").trim();
      }
    }
    return { province, district, municipality };
  } catch {
    return { province: "", district: "", municipality: "" };
  }
};

const haversineMetres = (lat1, lng1, lat2, lng2) => {
  const radius = 6371000;
  const radians = (degrees) => (degrees * Math.PI) / 180;
  const dLat = radians(lat2 - lat1);
  const dLng = radians(lng2 - lng1);
  const value =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(lat1)) *
      Math.cos(radians(lat2)) *
      Math.sin(dLng / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
};

const findNearbyStop = async (lat, lng) => {
  const radius = 800;
  const offset = radius / 111_000;
  const candidates = await Stop.find({
    "coordinates.lat": { $gte: lat - offset, $lte: lat + offset },
    "coordinates.lng": { $gte: lng - offset, $lte: lng + offset },
    status: "ACTIVE",
  })
    .select("_id name aliases district municipality province coordinates")
    .lean();
  let closest = null;
  let closestDistance = Infinity;
  for (const stop of candidates) {
    const stopLat = stop.coordinates?.lat;
    const stopLng = stop.coordinates?.lng;
    if (!stopLat || !stopLng) continue;
    const distance = haversineMetres(lat, lng, stopLat, stopLng);
    if (distance <= radius && distance < closestDistance) {
      closest = stop;
      closestDistance = distance;
    }
  }
  return closest
    ? { stop: closest, distanceM: Math.round(closestDistance) }
    : null;
};

module.exports = { geocodeAdminBoundaries, findNearbyStop };
