"use strict";

function normalizeAliases(aliases, name) {
  if (!Array.isArray(aliases)) return [];
  const canonical = (name || "").toLowerCase().trim();
  const cleaned = new Map();

  aliases.forEach((alias) => {
    if (!alias || typeof alias !== "string") return;
    const t = alias.trim();
    if (!t) return;
    const lower = t.toLowerCase();
    if (lower === canonical) return;
    if (!cleaned.has(lower)) {
      cleaned.set(lower, t);
    }
  });

  return Array.from(cleaned.values());
}

module.exports = { normalizeAliases };
