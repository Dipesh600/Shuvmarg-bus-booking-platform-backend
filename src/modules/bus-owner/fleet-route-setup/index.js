"use strict";

const service = require("./fleet-route-catalog.service.js");
const boardingCatalog = require("./boarding-catalog.service.js");
const routeSetup = require("./route-setup.service.js");
const reusableSetup = require("./reusable-setup.service.js");
const { createFleetRouteCatalogController } = require("./fleet-route-catalog.controller.js");

module.exports = createFleetRouteCatalogController(
  service, boardingCatalog, routeSetup, reusableSetup
);
