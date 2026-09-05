"use strict";

const configuration = require("../../admin/operator-route-configuration/configuration.service.js");
const lifecycle = require("../../admin/operator-route-configuration/config-lifecycle.service.js");
const {
  assertOwnedBrand,
  assertVariantBelongsToApprovedFleetCorridor,
  assertOwnedApprovedFleetForVariant,
  assertConfigBelongsToOwnedBrand,
  normalizeOperatorServiceType,
  normalizeId,
} = require("./operator-route-configuration.policy.js");

function ownerId(req) { return req.userInfo?.id; }

function createWriteHandlers({ sendError }) {
  return {
    async upsertOperatorConfig(req, res) {
      try {
        const { brandId, variantId, fleetId } = req.body;
        await assertOwnedBrand(ownerId(req), brandId);
        await assertOwnedApprovedFleetForVariant(ownerId(req), { brandId, fleetId, variantId });
        const data = await configuration.upsertOperatorConfig(brandId, {
          ...req.body,
          patternName: normalizeOperatorServiceType(req.body.patternName),
        });
        return res.status(200).json({ success: true, message: "Route service configuration saved.", data });
      } catch (error) { return sendError(res, error); }
    },
    async updateConfig(req, res) {
      try {
        const config = await assertConfigBelongsToOwnedBrand(ownerId(req), req.params.configId);
        if (req.body.fleetId) await assertConfigBelongsToOwnedBrand(ownerId(req), req.params.configId, { fleetId: req.body.fleetId });
        await authorizeConfigFleet(ownerId(req), config);
        const data = await lifecycle.updateConfig(req.params.configId, {
          ...req.body,
          ...(req.body.patternName === undefined ? {} : {
            patternName: normalizeOperatorServiceType(req.body.patternName),
          }),
        });
        return res.status(200).json({ success: true, message: "Route service configuration updated.", data });
      } catch (error) { return sendError(res, error); }
    },
  };
}

async function authorizeConfigFleet(userId, config) {
  if (config.fleetId) {
    await assertOwnedApprovedFleetForVariant(userId, {
      brandId: normalizeId(config.brandId),
      fleetId: normalizeId(config.fleetId),
      variantId: normalizeId(config.variantId),
    });
    return;
  }
  await assertVariantBelongsToApprovedFleetCorridor(
    normalizeId(config.brandId),
    normalizeId(config.variantId)
  );
}

module.exports = { createWriteHandlers };
