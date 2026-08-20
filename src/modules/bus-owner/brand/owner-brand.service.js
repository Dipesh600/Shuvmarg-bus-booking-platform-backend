"use strict";

const OperatorBrandModel = require("../../../../models/operatorBrandModel");

function createOwnerBrandService(deps = {}) {
  const OperatorBrand = deps.OperatorBrand || OperatorBrandModel;

  async function listMyBrands(ownerId) {
    if (!ownerId) {
      return [];
    }
    const brands = await OperatorBrand.find({ ownerId })
      .select("_id brandName brandCode isDefault status")
      .sort({ isDefault: -1, brandName: 1 })
      .lean();

    return brands.map((b) => ({
      id: String(b._id),
      brandName: b.brandName,
      brandCode: b.brandCode,
      isDefault: Boolean(b.isDefault),
      status: b.status,
    }));
  }

  return { listMyBrands };
}

module.exports = { createOwnerBrandService };
