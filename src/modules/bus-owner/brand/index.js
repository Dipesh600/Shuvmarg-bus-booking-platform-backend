"use strict";

const { createOwnerBrandService } = require("./owner-brand.service");
const { createOwnerBrandController } = require("./owner-brand.controller");

const service = createOwnerBrandService();
const controller = createOwnerBrandController({ service });

module.exports = {
  listBrands: controller.listBrands,
  createOwnerBrandService,
  createOwnerBrandController,
};
