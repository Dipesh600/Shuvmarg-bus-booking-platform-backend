"use strict";

const configuration = require("../../admin/operator-route-configuration/configuration.service.js");
const catalog = require("../../admin/operator-route-configuration/variant-catalog.service.js");
const { getAvailableVariantsForOwner } = require("./operator-route-configuration.catalog.js");
const {
  assertOwnedBrand,
  assertVariantBelongsToApprovedFleetCorridor,
  assertOwnedApprovedFleet,
  assertOwnedApprovedFleetForVariant,
  assertConfigBelongsToOwnedBrand,
  normalizeId,
} = require("./operator-route-configuration.policy.js");

function ownerId(req) { return req.userInfo?.id; }

function createReadHandlers({ sendError }) {
  return {
    async getAvailableVariants(req, res) {
      try {
        const brandId = req.query.brandId;
        await assertOwnedBrand(ownerId(req), brandId);
        const fleet = req.query.fleetId
          ? await assertOwnedApprovedFleet(ownerId(req), { brandId, fleetId: req.query.fleetId })
          : null;
        const data = await getAvailableVariantsForOwner(brandId, {
          fleetId: req.query.fleetId || null,
          corridorIds: fleet ? [normalizeId(fleet.corridorId)] : null,
        });
        return res.status(200).json({ success: true, results: data.length, data });
      } catch (error) { return sendError(res, error); }
    },
    async getOperatorConfigs(req, res) {
      try {
        const { brandId } = req.params;
        await assertOwnedBrand(ownerId(req), brandId);
        if (req.query.fleetId) await assertOwnedApprovedFleet(ownerId(req), { brandId, fleetId: req.query.fleetId });
        const data = await configuration.getOperatorConfigs(brandId, {
          statuses: ["ACTIVE", "DRAFT"], fleetId: req.query.fleetId || null,
        });
        return res.status(200).json({ success: true, results: data.length, data });
      } catch (error) { return sendError(res, error); }
    },
    async getVariantStopsWithConfig(req, res) {
      try {
        const { brandId, variantId } = req.params;
        await authorizeVariantRead(req, brandId, variantId);
        const data = await catalog.getVariantStopsWithConfig(variantId, brandId, {
          configId: req.query.configId || null,
          fleetId: req.query.fleetId || null,
        });
        return res.status(200).json({ success: true, results: data.length, data });
      } catch (error) { return sendError(res, error); }
    },
    async getReturnVariantStops(req, res) {
      try {
        const { brandId, variantId } = req.params;
        await authorizeVariantRead(req, brandId, variantId);
        const data = await catalog.getReturnVariantStops(variantId, brandId, {
          configId: req.query.configId || null,
          fleetId: req.query.fleetId || null,
        });
        return res.status(200).json({ success: true, data });
      } catch (error) { return sendError(res, error); }
    },
    async listPatternsForVariant(req, res) {
      try {
        const { brandId, variantId } = req.params;
        await assertOwnedBrand(ownerId(req), brandId);
        await assertVariantBelongsToApprovedFleetCorridor(brandId, variantId);
        const data = await configuration.listPatternsForVariant(brandId, variantId);
        return res.status(200).json({ success: true, results: data.length, data });
      } catch (error) { return sendError(res, error); }
    },
  };
}

async function authorizeVariantRead(req, brandId, variantId) {
  await assertOwnedBrand(ownerId(req), brandId);
  if (req.query.fleetId) await assertOwnedApprovedFleetForVariant(ownerId(req), { brandId, fleetId: req.query.fleetId, variantId });
  else await assertVariantBelongsToApprovedFleetCorridor(brandId, variantId);
  if (req.query.configId) {
    await assertConfigBelongsToOwnedBrand(ownerId(req), req.query.configId, {
      brandId, variantId, ...(req.query.fleetId ? { fleetId: req.query.fleetId } : {}),
    });
  }
}

module.exports = { createReadHandlers };
