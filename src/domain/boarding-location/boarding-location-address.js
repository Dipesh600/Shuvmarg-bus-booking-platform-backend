"use strict";

const PLUS_CODE = /\b[23456789CFGHJMPQRVWX]{4,8}\+[23456789CFGHJMPQRVWX]{2,3}\b/gi;
const NEPAL_POSTAL_CODE = /\b\d{5}\b/g;

function normalizeBoardingAddress(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const seen = new Set();
  const parts = value
    .split(",")
    .map((part) => part
      .replace(PLUS_CODE, "")
      .replace(NEPAL_POSTAL_CODE, "")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^[-–—]+|[-–—]+$/g, "")
      .trim())
    .filter(Boolean)
    .filter((part) => {
      const normalized = part.toLocaleLowerCase();
      if (seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    });
  return parts.join(", ") || null;
}

function normalizeBoardingProviderMetadata(metadata) {
  if (!metadata || typeof metadata !== "object") return metadata;
  return {
    ...metadata,
    suggestedAddress: normalizeBoardingAddress(metadata.suggestedAddress),
  };
}

module.exports = {
  normalizeBoardingAddress, normalizeBoardingProviderMetadata,
};
