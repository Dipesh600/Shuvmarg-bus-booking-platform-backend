"use strict";

function buildCodeCandidates(name, district) {
  const letters = (name || "").replace(/[^a-zA-Z]/g, "");
  const consonants = letters.replace(/[aeiouAEIOU]/g, "");
  let base = (consonants.length >= 3 ? consonants : letters).substring(0, 3).toUpperCase();
  if (!base) base = "STP";

  const candidates = [base, `${base}2`, `${base}3`, `${base}4`, `${base}5`];

  if (district) {
    const initials = district
      .split(/\s+/)
      .map((w) => w[0] || "")
      .join("")
      .toUpperCase();
    if (initials) candidates.push(`${base}-${initials}`);
  }

  candidates.push(`${base}-${Date.now().toString(36).toUpperCase()}`);
  return candidates;
}

module.exports = { buildCodeCandidates };
