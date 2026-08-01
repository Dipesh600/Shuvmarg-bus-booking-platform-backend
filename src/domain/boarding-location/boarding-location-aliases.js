"use strict";

const { normalizeIdentityPart } = require("./boarding-location-identity.js");

function normalizeBoardingLocationAliases(aliases, canonicalName) {
  if (!Array.isArray(aliases)) return [];
  const canonical = normalizeIdentityPart(canonicalName);
  const unique = new Map();
  for (const alias of aliases) {
    if (typeof alias !== "string") continue;
    const displayValue = alias.trim().replace(/\s+/g, " ");
    const normalized = normalizeIdentityPart(displayValue);
    if (!normalized || normalized === canonical || unique.has(normalized)) {
      continue;
    }
    unique.set(normalized, displayValue);
  }
  return [...unique.values()];
}

module.exports = { normalizeBoardingLocationAliases };
