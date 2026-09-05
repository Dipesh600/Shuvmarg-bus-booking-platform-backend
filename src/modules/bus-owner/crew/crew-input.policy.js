"use strict";
const { isObjectIdOrHexString } = require("mongoose");
const AppError = require("../../../shared/errors/app-error");
const { normalizePhone } = require("../../../../utils/phoneGuard");

const assertId = (value, label) => {
  if (!isObjectIdOrHexString(value)) throw new AppError(`${label} is invalid.`, 400);
};
const phoneVariants = (phone) => [phone, `+977${phone}`, `977${phone}`, `0${phone}`];
const validateAssignment = (ownerId, role, input = {}) => {
  assertId(ownerId, "Owner");
  assertId(input.brandId, "Brand");
  if (!["driver", "conductor"].includes(role)) throw new AppError("Invalid crew role.", 400);
  const phone = typeof input.phone === "string" ? normalizePhone(input.phone) : "";
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!/^9[78]\d{8}$/.test(phone)) throw new AppError("A valid Nepal mobile number is required.", 400);
  if (name.length < 3 || name.length > 100) throw new AppError("Name must contain 3–100 characters.", 400);
  const data = { phone, name, brandId: input.brandId };
  if (role === "driver") {
    const experienceYears = Number(input.experienceYears);
    const inviteRetry = input.resendInvite === true || input.resendInvite === "true";
    const validGender = ["male", "female", "other"].includes(input.gender);
    if (typeof input.licenseNumber !== "string" || !input.licenseNumber.trim() ||
        input.licenseNumber.length > 100 || !["HV", "LV", "TRK"].includes(input.licenseType) ||
        typeof input.licenseExpiry !== "string" || !Number.isFinite(Date.parse(input.licenseExpiry)) ||
        (!validGender && !inviteRetry) ||
        !Number.isInteger(experienceYears) || experienceYears < 0 || experienceYears > 80) {
      throw new AppError("Valid gender, experience, license number, type and expiry are required.", 400);
    }
    Object.assign(data, { licenseNumber: input.licenseNumber.trim().toUpperCase(),
      licenseType: input.licenseType, licenseExpiry: new Date(input.licenseExpiry),
      ...(validGender ? { gender: input.gender } : {}), experienceYears });
  }
  return data;
};
module.exports = { assertId, phoneVariants, validateAssignment };
