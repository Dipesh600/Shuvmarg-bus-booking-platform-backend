"use strict";

const { AUTHENTICATION_ERRORS } = require("./authentication-errors");
const { AUTHORIZATION_ERRORS } = require("./authorization-errors");
const { VALIDATION_ERRORS } = require("./validation-errors");
const { BUS_OWNER_ERRORS } = require("./bus-owner-errors");
const { FLEET_ERRORS } = require("./fleet-errors");
const { DOCUMENT_ERRORS } = require("./document-errors");
const { GENERAL_ERRORS } = require("./general-errors");

const combined = {
  ...AUTHENTICATION_ERRORS,
  ...AUTHORIZATION_ERRORS,
  ...VALIDATION_ERRORS,
  ...BUS_OWNER_ERRORS,
  ...FLEET_ERRORS,
  ...DOCUMENT_ERRORS,
  ...GENERAL_ERRORS,
};

const keysCount =
  Object.keys(AUTHENTICATION_ERRORS).length +
  Object.keys(AUTHORIZATION_ERRORS).length +
  Object.keys(VALIDATION_ERRORS).length +
  Object.keys(BUS_OWNER_ERRORS).length +
  Object.keys(FLEET_ERRORS).length +
  Object.keys(DOCUMENT_ERRORS).length +
  Object.keys(GENERAL_ERRORS).length;

if (Object.keys(combined).length !== keysCount) {
  throw new Error("Duplicate error code detected in API error registries!");
}

const API_ERROR_REGISTRY = Object.freeze(combined);

function getApiErrorDefinition(code) {
  const definition = API_ERROR_REGISTRY[code];
  if (!definition) {
    throw new Error(`Unknown API error code: '${code}'`);
  }
  return definition;
}

module.exports = {
  API_ERROR_REGISTRY,
  getApiErrorDefinition,
};
