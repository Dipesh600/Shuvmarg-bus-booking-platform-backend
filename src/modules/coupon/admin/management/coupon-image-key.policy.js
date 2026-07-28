"use strict";

const path = require("path");

const normalizeKey = (value) => path.posix.normalize(value);

const storedImageKey = (value) => {
  if (!value) return null;
  if (!value.startsWith("http")) return value;
  try {
    return new URL(value).pathname.replace(/^\//, "");
  } catch {
    return null;
  }
};

const isCouponImageKey = (value) =>
  Boolean(value && normalizeKey(value).startsWith("platform/coupons/"));

module.exports = { normalizeKey, storedImageKey, isCouponImageKey };
