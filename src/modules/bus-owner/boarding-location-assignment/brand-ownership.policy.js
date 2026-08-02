"use strict";

const mongoose = require("mongoose");
const OperatorBrand = require("../../../../models/operatorBrandModel.js");
const OperatorRouteConfig = require("../../../../models/operatorRouteConfigModel.js");
const {
  boardingLocationError,
} = require("../../../domain/boarding-location/boarding-location-errors.js");

async function assertOwnedActiveBrand(ownerId, brandId) {
  if (!mongoose.isValidObjectId(brandId)) {
    throw boardingLocationError("INVALID_OPERATOR_BRAND", "Select a valid operator brand.", 400);
  }
  const brand = await OperatorBrand.findOne({ _id: brandId, ownerId }).lean();
  if (!brand) {
    throw boardingLocationError("OPERATOR_BRAND_NOT_FOUND", "Operator brand not found.", 404);
  }
  if (brand.status !== "ACTIVE") {
    throw boardingLocationError("OPERATOR_BRAND_INACTIVE", "The operator brand must be active.", 409);
  }
  return brand;
}

async function listOwnedOperatorBrands(ownerId) {
  const brands = await OperatorBrand.find({ ownerId })
    .select("brandName brandCode status").sort({ brandName: 1 }).lean();
  return brands.map((brand) => ({
    id: String(brand._id), name: brand.brandName,
    code: brand.brandCode, status: brand.status,
  }));
}

async function listBrandServedStopIds(brandId) {
  const configs = await OperatorRouteConfig.find({ brandId, status: "ACTIVE" })
    .select("activeStops returnActiveStops").lean();
  const ids = configs.flatMap((config) => [
    ...(config.activeStops || []), ...(config.returnActiveStops || []),
  ]).map(String);
  return [...new Set(ids)];
}

async function assertBrandServesStop(brandId, stopId) {
  if (!mongoose.isValidObjectId(stopId)) {
    throw boardingLocationError("INVALID_ROUTE_STOP", "Select a valid route stop.", 400);
  }
  const config = await OperatorRouteConfig.exists({
    brandId, status: "ACTIVE",
    $or: [{ activeStops: stopId }, { returnActiveStops: stopId }],
  });
  if (!config) {
    throw boardingLocationError(
      "ROUTE_STOP_NOT_SERVED",
      "The selected operator brand does not serve this route stop.", 409
    );
  }
}

module.exports = {
  assertOwnedActiveBrand, listOwnedOperatorBrands,
  listBrandServedStopIds, assertBrandServesStop,
};
