"use strict";

const {
  FRAUD_REFERRAL_THRESHOLD,
  FRAUD_WINDOW_DAYS,
} = require("./referral-reward.constants");

const createReferralFraudService = ({ repository, logger = console }) => {
  const checkPatterns = async (referrerId, ipAddress, deviceInfo) => {
    const windowStart = new Date();
    windowStart.setDate(windowStart.getDate() - FRAUD_WINDOW_DAYS);
    const recentCount = await repository.countRecent(
      referrerId,
      windowStart
    );
    if (recentCount < FRAUD_REFERRAL_THRESHOLD) return;
    const flagReason = `${recentCount} referrals in ${FRAUD_WINDOW_DAYS} days.${
      ipAddress ? ` IP: ${ipAddress}.` : ""
    }${deviceInfo ? ` Device: ${deviceInfo}.` : ""}`;
    await repository.flagRecent(referrerId, windowStart, flagReason);
    logger.warn(
      `[REFERRAL FRAUD] Referrer ${referrerId} flagged: ${flagReason}`
    );
  };

  return { checkPatterns };
};

module.exports = { createReferralFraudService };
