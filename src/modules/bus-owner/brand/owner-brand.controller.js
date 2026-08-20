"use strict";

const { createOwnerBrandService } = require("./owner-brand.service");

function createOwnerBrandController(deps = {}) {
  const service = deps.service || createOwnerBrandService(deps);

  async function listBrands(req, res) {
    try {
      const ownerId = req.userInfo?.id || req.user?.id || req.user?._id;
      if (!ownerId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized",
        });
      }
      const brands = await service.listMyBrands(ownerId);
      return res.status(200).json({
        success: true,
        data: brands,
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to fetch operator brands.",
      });
    }
  }

  return { listBrands };
}

module.exports = { createOwnerBrandController };
