"use strict";

const RouteStop = require("../../../../models/routeStopModel.js");
const RouteVariant = require("../../../../models/routeVariantModel.js");
const { deleteVariantDraftArtifacts } = require("./variant-draft-cleanup.service.js");
const { assertVariantCanDelete } = require("./variant-reference.policy.js");
const { routeVariantError } = require("./route-variant-errors.js");

async function deleteVariant(id) {
  const variant = await RouteVariant.findById(id);
  if (!variant) throw routeVariantError("VARIANT_NOT_FOUND", "Route variant not found.", 404);
  const companion = variant.returnVariantId ? await RouteVariant.findById(variant.returnVariantId) : null;
  const paired = companion?.status === "DRAFT" && String(companion.returnVariantId) === String(variant._id);
  await assertVariantCanDelete(variant, { allowedLinkedVariantId: paired ? companion._id : null });
  if (paired) await assertVariantCanDelete(companion, { allowedLinkedVariantId: variant._id });
  const ids = paired ? [variant._id, companion._id] : [variant._id];
  await RouteStop.deleteMany(paired ? { variantId: { $in: ids } } : { variantId: variant._id });
  await Promise.all(ids.map(deleteVariantDraftArtifacts));
  if (paired) await RouteVariant.deleteMany({ _id: { $in: ids } });
  else await RouteVariant.findByIdAndDelete(variant._id);
}

module.exports = { deleteVariant };
