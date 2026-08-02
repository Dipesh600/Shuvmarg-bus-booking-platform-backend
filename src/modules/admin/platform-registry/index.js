"use strict";

module.exports = {
  ...require("./stop-registry.controller.js"),
  ...require("./corridor-registry.controller.js"),
  ...require("./route-variant-registry.controller.js"),
  ...require("./registry-boarding-point.controller.js"),
  ...require("./boarding-location/boarding-location.controller.js"),
  ...require("./boarding-location/boarding-assignment-review.controller.js"),
};
