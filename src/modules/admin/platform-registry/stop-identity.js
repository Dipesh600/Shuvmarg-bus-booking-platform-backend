/**
 * Generates a deterministic normalized identity for a stop.
 * The rule is:
 * normalized name + normalized district + normalized municipality + normalized parentStopId
 */
function buildStopIdentity({ name, district, municipality, parentStopId }) {
  if (!name || name.trim() === "") {
    const err = new Error("Stop name is required to build identity.");
    err.code = "VALIDATION_ERROR";
    err.statusCode = 400;
    throw err;
  }

  const normalize = (str) => {
    if (!str) return "";
    const s = typeof str === 'object' ? str.toString() : String(str);
    return s.trim().toLowerCase().replace(/\s+/g, ' ');
  };

  const nName = normalize(name);
  const nDistrict = normalize(district);
  const nMunicipality = normalize(municipality);
  const nParent = normalize(parentStopId);

  return `${nName}:${nDistrict}:${nMunicipality}:${nParent}`;
}

module.exports = { buildStopIdentity };
