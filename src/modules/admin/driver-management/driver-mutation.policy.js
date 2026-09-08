"use strict";
const AppError = require("../../../shared/errors/app-error");
const { normalizePhone } = require("../../../../utils/phoneGuard");
  const normalize = driver => {
    driver.phone = normalizePhone(driver.phone);
    if (!/^9[78]\d{8}$/.test(driver.phone)) throw new AppError("A valid Nepal mobile number is required.", 400);
    if (!driver.fullName || driver.fullName.trim().length < 3) throw new AppError("Full name must contain at least 3 characters.", 400);
    if (!["male", "female", "other"].includes(driver.gender)) throw new AppError("Gender is required.", 400);
    if (!Number.isInteger(driver.experienceYears) || driver.experienceYears < 0 || driver.experienceYears > 80) {
      throw new AppError("Experience must be a whole number from 0 to 80 years.", 400);
    }
  };
  const review = (driver, status, adminId, reason = null) => {
    driver.reviewHistory ||= [];
    driver.reviewHistory.push({ from: driver.approvalStatus, to: status, actorId: adminId, at: new Date(), reason });
    driver.approvalStatus = status;
  };

module.exports = { normalize, review };
