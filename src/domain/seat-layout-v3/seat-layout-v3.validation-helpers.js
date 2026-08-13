"use strict";

const { SeatLayoutV3Error } = require("./seat-layout-v3.error");

function fail(message, path = null) {
  throw new SeatLayoutV3Error(message, path);
}

function plainObject(value, path) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(`${path} must be an object.`, path);
  }
  return value;
}

function strictKeys(value, allowed, path) {
  const unknown = Object.keys(value).find((key) => !allowed.has(key));
  if (unknown) fail(`${path}.${unknown} is unsupported.`, `${path}.${unknown}`);
}

function text(value, path, maxLength, { nullable = false } = {}) {
  if (nullable && value == null) return null;
  if (typeof value !== "string" || !value.trim()) fail(`${path} is required.`, path);
  const result = value.trim();
  if (result.length > maxLength) fail(`${path} is too long.`, path);
  return result;
}

function integer(value, path, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) {
    fail(`${path} must be an integer between ${min} and ${max}.`, path);
  }
  return value;
}

function enumValue(value, allowed, path) {
  if (!allowed.has(value)) fail(`${path} is unsupported.`, path);
  return value;
}

function unique(value, seen, path, label) {
  const key = value.toLocaleLowerCase("en-US");
  if (seen.has(key)) fail(`${label} "${value}" is duplicated.`, path);
  seen.add(key);
}

module.exports = { fail, plainObject, strictKeys, text, integer, enumValue, unique };
