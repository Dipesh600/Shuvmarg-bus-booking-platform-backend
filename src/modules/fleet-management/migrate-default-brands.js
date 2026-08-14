"use strict";

const BusOwnerModel = require("../../../models/busOwnerModel");
const OperatorBrandModel = require("../../../models/operatorBrandModel");
const { createDefaultBrandService, normalizeBrandName } = require("../bus-owner/kyc-review/kyc-default-brand.service");

async function runDefaultBrandMigration(options = {}, deps = {}) {
  const { dryRun = false } = options;
  const BusOwner = deps.BusOwner || BusOwnerModel;
  const OperatorBrand = deps.OperatorBrand || OperatorBrandModel;
  const defaultBrandService = deps.defaultBrandService || createDefaultBrandService({ OperatorBrand });

  const stats = {
    dryRun,
    normalizedExistingBrands: 0,
    designatedDefaultFromExisting: 0,
    createdDefaultBrands: 0,
    skippedMissingCompanyName: 0,
    ambiguousMultipleBrands: 0,
    errors: [],
  };

  // 1. Backfill normalizedName on existing brands
  const existingBrands = await OperatorBrand.find({}).lean();
  for (const brand of existingBrands) {
    const normalized = normalizeBrandName(brand.brandName);
    if (!brand.normalizedName || brand.normalizedName !== normalized) {
      if (!dryRun) {
        await OperatorBrand.updateOne(
          { _id: brand._id },
          { $set: { normalizedName: normalized } }
        );
      }
      stats.normalizedExistingBrands += 1;
    }
  }

  // 2. Process approved owners
  const approvedOwners = await BusOwner.find({ verificationStatus: "approved" }).lean();

  for (const owner of approvedOwners) {
    const ownerBrands = await OperatorBrand.find({ ownerId: owner.user }).lean();
    const hasDefault = ownerBrands.some((b) => b.isDefault === true);

    if (hasDefault) {
      continue;
    }

    if (ownerBrands.length === 1 && ownerBrands[0].status === "ACTIVE") {
      // Unambiguous single active brand: designate as default
      if (!dryRun) {
        await OperatorBrand.updateOne(
          { _id: ownerBrands[0]._id },
          { $set: { isDefault: true } }
        );
      }
      stats.designatedDefaultFromExisting += 1;
    } else if (ownerBrands.length === 0) {
      // Approved owner with no brand: create default brand if companyName exists
      const cleanCompany = (owner.companyName || "").trim();
      if (!cleanCompany) {
        stats.skippedMissingCompanyName += 1;
        stats.errors.push({
          ownerId: String(owner.user),
          reason: "Approved owner has no companyName to derive default brand.",
        });
      } else {
        if (!dryRun) {
          await defaultBrandService.ensureDefaultBrand({
            ownerId: owner.user,
            companyName: cleanCompany,
            adminId: owner.approvedBy || null,
          });
        }
        stats.createdDefaultBrands += 1;
      }
    } else {
      // Multiple existing brands with no default: ambiguous
      stats.ambiguousMultipleBrands += 1;
      stats.errors.push({
        ownerId: String(owner.user),
        reason: `Owner has ${ownerBrands.length} brands but none is designated as default.`,
        brandIds: ownerBrands.map((b) => String(b._id)),
      });
    }
  }

  return stats;
}

module.exports = { runDefaultBrandMigration };
