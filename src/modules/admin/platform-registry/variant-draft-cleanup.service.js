"use strict";

const mongoose = require("mongoose");
const RouteVariantMapReview = require("../../../../models/routeVariantMapReviewModel.js");
const RouteVariantStopCandidate = require("../../../../models/routeVariantStopCandidateModel.js");

async function deleteVariantDraftArtifacts(variantId) {
  if (!mongoose.isValidObjectId(variantId)) return;
  await RouteVariantStopCandidate.deleteMany({ variantId });
  await RouteVariantMapReview.deleteMany({ variantId });
}

module.exports = { deleteVariantDraftArtifacts };
