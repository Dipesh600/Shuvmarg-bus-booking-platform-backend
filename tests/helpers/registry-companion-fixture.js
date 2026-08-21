"use strict";

const mongoose = require("mongoose");
const RouteCorridor = require("../../models/routeCorridorModel.js");
const RouteVariant = require("../../models/routeVariantModel.js");
const RouteStop = require("../../models/routeStopModel.js");
const Stop = require("../../models/stopModel.js");
require("../../models/adminModel.js");

const stopData = (name, code, type) => ({
  name, code, type, status: "ACTIVE", verificationStatus: "VERIFIED", isRouteStop: true,
});

async function createCompanionFixture(suffix = "") {
  const codes = Object.fromEntries(["KTM", "MLK", "DUM", "MUG", "PKR"].map((code) => [code, `${code}${suffix}`]));
  const [ktm, mlk, dum, mug, pkr] = await Stop.create([
    stopData(`Kathmandu ${suffix}`, codes.KTM, "CITY"),
    stopData(`Malekhu ${suffix}`, codes.MLK, "JUNCTION"),
    stopData(`Dumre ${suffix}`, codes.DUM, "TOWN"),
    stopData(`Mugling ${suffix}`, codes.MUG, "TOWN"),
    stopData(`Pokhara ${suffix}`, codes.PKR, "CITY"),
  ]);
  const corridor = await RouteCorridor.create({ code: `CR-${codes.KTM}-${codes.PKR}`, originId: ktm._id, destinationId: pkr._id, status: "ACTIVE" });
  const common = {
    corridorId: corridor._id,
    routeFamilyId: new mongoose.Types.ObjectId(),
    type: "STANDARD",
    distanceKm: 200,
    durationMinutes: 360,
    status: "ACTIVE",
  };
  const forward = await RouteVariant.create({ ...common, name: `Kathmandu Pokhara ${suffix}`, direction: "FORWARD", originTerminalStopId: ktm._id, destinationTerminalStopId: pkr._id, code: `${codes.KTM}-${codes.PKR}-01` });
  const returning = await RouteVariant.create({ ...common, name: `Pokhara Kathmandu ${suffix}`, direction: "RETURN", originTerminalStopId: pkr._id, destinationTerminalStopId: ktm._id, code: `${codes.PKR}-${codes.KTM}-01`, returnVariantId: forward._id });
  forward.returnVariantId = returning._id;
  await forward.save();
  await RouteStop.create([
    { variantId: forward._id, stopId: ktm._id, sequence: 1, isMajor: true, distanceFromOriginKm: 0, durationFromOriginMins: 0 },
    { variantId: forward._id, stopId: mug._id, sequence: 2, isMajor: true, distanceFromOriginKm: 110, durationFromOriginMins: 180 },
    { variantId: forward._id, stopId: pkr._id, sequence: 3, isMajor: true, distanceFromOriginKm: 200, durationFromOriginMins: 360 },
    { variantId: returning._id, stopId: pkr._id, sequence: 1, isMajor: true, distanceFromOriginKm: 0, durationFromOriginMins: 0 },
    { variantId: returning._id, stopId: mug._id, sequence: 2, isMajor: true, distanceFromOriginKm: 90, durationFromOriginMins: 180 },
    { variantId: returning._id, stopId: ktm._id, sequence: 3, isMajor: true, distanceFromOriginKm: 200, durationFromOriginMins: 360 },
  ]);
  return { codes, stops: { ktm, mlk, dum, mug, pkr }, forward, returning };
}

module.exports = { createCompanionFixture };
