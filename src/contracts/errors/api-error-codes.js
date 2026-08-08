"use strict";

const { API_ERROR_REGISTRY } = require("./registry");

const API_ERROR_CODES = Object.freeze(
  Object.keys(API_ERROR_REGISTRY).reduce((acc, code) => {
    acc[code] = code;
    return acc;
  }, {})
);

module.exports = { API_ERROR_CODES };
