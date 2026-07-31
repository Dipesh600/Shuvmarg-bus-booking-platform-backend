"use strict";

const BULK_MAX = 500;
const VALID_TYPES = ["CITY", "JUNCTION", "TOWN", "BORDER"];

function validateBatch(rawStops, includeSentCount = false) {
  if (!Array.isArray(rawStops)) throw new Error("Payload must be a JSON array.");
  if (rawStops.length === 0) throw new Error("Array is empty — nothing to import.");
  if (rawStops.length > BULK_MAX) {
    const sent = includeSentCount ? ` You sent ${rawStops.length}.` : "";
    throw new Error(`Batch too large. Maximum is ${BULK_MAX} stops per import.${sent}`);
  }
}

function sanitizeEntry(raw, index) {
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: `Row ${index + 1}: must be an object.`, raw, _sourceIndex: index };
  }
  const code = typeof raw.code === "string" ? raw.code.trim().toUpperCase() : null;
  const name = typeof raw.name === "string" ? raw.name.trim() : null;
  if (!code) {
    return { ok: false, error: `Row ${index + 1}: 'code' is required and must be a non-empty string.`, raw, _sourceIndex: index };
  }
  if (!/^[A-Z0-9]{2,8}$/.test(code)) {
    return { ok: false, error: `Row ${index + 1}: code "${code}" must be 2–8 uppercase letters/digits (no spaces or special characters).`, raw, _sourceIndex: index };
  }
  if (!name) {
    return { ok: false, error: `Row ${index + 1}: 'name' is required and must be a non-empty string.`, raw, _sourceIndex: index };
  }
  if (name.length > 100) {
    return { ok: false, error: `Row ${index + 1}: name is too long (max 100 characters).`, raw, _sourceIndex: index };
  }
  const type = raw.type ? String(raw.type).toUpperCase().trim() : "CITY";
  if (!VALID_TYPES.includes(type)) {
    return { ok: false, error: `Row ${index + 1}: type "${type}" is invalid. Must be one of CITY, JUNCTION, TOWN, BORDER.`, raw, _sourceIndex: index };
  }
  const province = raw.province ? String(raw.province).trim().substring(0, 80) : undefined;
  const district = raw.district ? String(raw.district).trim().substring(0, 80) : undefined;
  const municipality = raw.municipality ? String(raw.municipality).trim().substring(0, 80) : undefined;
  // bulk import usually references parent by code if at all, but let's allow parentStopId if it's an ObjectId or string
  const parentStopId = raw.parentStopId ? String(raw.parentStopId).trim() : undefined;

  const aliases = Array.isArray(raw.aliases)
    ? raw.aliases.map((a) => String(a).trim()).filter(Boolean)
    : typeof raw.aliases === "string"
      ? raw.aliases.split(",").map((a) => a.trim()).filter(Boolean)
      : [];
  
  const entry = { _sourceIndex: index, code, name, type, aliases };
  if (province) entry.province = province;
  if (district) entry.district = district;
  if (municipality) entry.municipality = municipality;
  if (parentStopId) entry.parentStopId = parentStopId;

  return { ok: true, entry };
}

module.exports = { validateBatch, sanitizeEntry };
