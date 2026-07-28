"use strict";

const createReferralNotificationService = ({
  createLocalNotification,
  logger = console,
}) => {
  const notify = async (userId, type, title, body) => {
    try {
      await createLocalNotification(userId, type, title, body, {});
    } catch (error) {
      logger.error(
        `Referral notification failed for ${userId}:`,
        error.message
      );
    }
  };

  const friendJoined = (userId) =>
    notify(
      userId,
      "REFERRAL_FRIEND_JOINED",
      "Your friend joined Shuvmarg!",
      "NPR 100 is waiting to unlock."
    );

  const fullyUnlocked = (userId, totalReward) =>
    notify(
      userId,
      "REFERRAL_FULLY_UNLOCKED",
      "Full Reward Earned! 🎉",
      `You've earned your full NPR ${totalReward}! Your friend has completed 5 trips.`
    );

  const partiallyUnlocked = (userId, amount, balance) =>
    notify(
      userId,
      "REFERRAL_UNLOCK",
      "Referral Reward Unlocked",
      `Your friend completed a trip — NPR ${amount} unlocked. You now have NPR ${balance.display} SM Money.`
    );

  return { friendJoined, fullyUnlocked, partiallyUnlocked };
};

module.exports = { createReferralNotificationService };
