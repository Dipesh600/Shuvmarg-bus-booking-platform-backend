"use strict";

const { sendError: respondWithError } = require("./operator-route-configuration.errors.js");
const { createReadHandlers } = require("./operator-route-configuration.read-handlers.js");
const { createWriteHandlers } = require("./operator-route-configuration.write-handlers.js");

function createBusOwnerOperatorRouteConfigController({ logger = console } = {}) {
  const sendError = (res, error) => respondWithError(res, error, logger);
  return {
    ...createReadHandlers({ sendError }),
    ...createWriteHandlers({ sendError }),
  };
}

module.exports = {
  createBusOwnerOperatorRouteConfigController,
};
