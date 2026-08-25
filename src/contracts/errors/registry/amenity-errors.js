"use strict";

const define = (statusCode, message) => Object.freeze({
  statusCode, message, domain: "amenity", retryable: false,
});

const AMENITY_ERRORS = Object.freeze({
  AMENITY_VALIDATION_FAILED: define(400, "Amenity details are invalid."),
  AMENITY_INVALID_ID: define(400, "Amenity ID is invalid."),
  AMENITY_OWNER_INVALID: define(400, "Select a valid bus owner for this amenity."),
  AMENITY_FORBIDDEN: define(403, "This amenity cannot be changed by this account."),
  AMENITY_NOT_FOUND: define(404, "Amenity not found."),
  AMENITY_ALREADY_EXISTS: define(409, "An amenity with this name already exists."),
  AMENITY_IN_USE: define(409, "This amenity is in use. Deactivate it instead."),
});

module.exports = { AMENITY_ERRORS };
