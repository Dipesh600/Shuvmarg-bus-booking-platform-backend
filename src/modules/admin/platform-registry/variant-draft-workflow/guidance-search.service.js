"use strict";

const {
  searchGoogleGuidancePlaces,
} = require("../../../../../services/googleRouteGuidancePlaces.js");
const { routeVariantError } = require("../route-variant-errors.js");
const { loadDraftVariant } = require("./context.service.js");

async function searchVariantDraftGuidancePlaces(variantId, query, dependencies = {}) {
  await loadDraftVariant(variantId);
  try {
    return await (dependencies.searchGoogleGuidancePlaces || searchGoogleGuidancePlaces)(query);
  } catch (error) {
    throw routeVariantError(
      "GOOGLE_PLACE_SEARCH_FAILED",
      error.message || "Google place search could not be completed.",
      502
    );
  }
}

module.exports = { searchVariantDraftGuidancePlaces };
