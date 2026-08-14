"use strict";

const OperatorBrandModel = require("../../../../models/operatorBrandModel");

function normalizeBrandName(name) {
  if (!name || typeof name !== "string") return "";
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

function createDefaultBrandService(deps = {}) {
  const OperatorBrand = deps.OperatorBrand || OperatorBrandModel;
  const clock = deps.clock || (() => new Date());
  const logger = deps.logger || console;

  async function ensureDefaultBrand({ ownerId, companyName, adminId, session } = {}) {
    if (!ownerId) {
      throw new Error("OWNER_ID_REQUIRED: ownerId is required for default brand creation.");
    }
    const cleanName = typeof companyName === "string" ? companyName.trim().replace(/\s+/g, " ") : "";
    if (!cleanName) {
      throw new Error("COMPANY_NAME_REQUIRED: A valid companyName is required for default brand creation.");
    }

    // 1. Check if default brand already exists for this owner
    let existingQuery = OperatorBrand.findOne({ ownerId, isDefault: true });
    if (session && existingQuery && typeof existingQuery.session === "function") {
      existingQuery = existingQuery.session(session);
    }
    const existing = existingQuery && typeof existingQuery.lean === "function" ? await existingQuery.lean() : await existingQuery;
    if (existing) {
      return { brand: existing, isNew: false };
    }

    const normalizedName = normalizeBrandName(cleanName);
    const now = clock();

    // 2. Create new default brand instance (triggers pre-save hook for brandCode)
    const newBrand = new OperatorBrand({
      ownerId,
      brandName: cleanName,
      normalizedName,
      isDefault: true,
      source: "KYC_APPROVAL",
      status: "ACTIVE",
      kycStatus: "APPROVED",
      approvedBy: adminId || null,
      approvedAt: now,
    });

    try {
      const saved = await newBrand.save(session ? { session } : undefined);
      const brandObj = typeof saved.toObject === "function" ? saved.toObject() : saved;
      return { brand: brandObj, isNew: true };
    } catch (error) {
      if (error && typeof error.hasErrorLabel === "function" && error.hasErrorLabel("TransientTransactionError")) {
        throw error;
      }
      // If duplicate key error due to race condition on (ownerId, isDefault) or unique brandCode
      if (error.code === 11000) {
        logger.warn(
          `[DefaultBrandService] Duplicate key during default brand creation for owner ${ownerId}. Recovering existing default brand.`
        );
        let recoverQuery = OperatorBrand.findOne({ ownerId, isDefault: true });
        if (session && recoverQuery && typeof recoverQuery.session === "function") {
          recoverQuery = recoverQuery.session(session);
        }
        const recovered = recoverQuery && typeof recoverQuery.lean === "function" ? await recoverQuery.lean() : await recoverQuery;
        if (recovered) {
          return { brand: recovered, isNew: false };
        }
      }
      logger.error("[DefaultBrandService] Failed to create default brand:", error);
      throw error;
    }
  }

  return {
    ensureDefaultBrand,
    normalizeBrandName,
  };
}

module.exports = {
  createDefaultBrandService,
  normalizeBrandName,
};
