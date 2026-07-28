"use strict";

const createCouponOfferNotificationService = ({
  User,
  UserDeviceInfo,
  notificationManager,
  createLocalNotification,
  scheduler = setImmediate,
  console: output = console,
}) => {
  const sendOfferNotificationToPassengers = (
    couponCode,
    title,
    discountType,
    discountValue
  ) => {
    scheduler(async () => {
      try {
        const users = await User.find(
          { roles: "passenger", status: "active" },
          { _id: 1 }
        ).lean();
        const passengerIds = users.map((user) => user._id.toString());
        if (passengerIds.length === 0) return;

        const devices = await UserDeviceInfo.find({
          userId: { $in: passengerIds },
        }).lean();
        const tokens = devices.map((device) => device.token).filter(Boolean);
        const label =
          discountType === "percentage"
            ? `${discountValue}% OFF`
            : `Rs. ${discountValue} OFF`;
        const notificationTitle =
          `🎉 New Offer: ${label} on your next trip!`;
        const body =
          `Use code ${couponCode} — ${title}. Book now before it expires!`;

        if (tokens.length > 0) {
          await notificationManager(tokens, notificationTitle, body);
        }
        for (let index = 0; index < passengerIds.length; index += 100) {
          const chunk = passengerIds.slice(index, index + 100);
          await Promise.allSettled(
            chunk.map((userId) =>
              createLocalNotification(
                userId,
                "COUPON_OFFER",
                notificationTitle,
                body,
                { couponCode }
              )
            )
          );
        }
      } catch (error) {
        output.error("[Offer Notification] Failed:", error.message);
      }
    });
  };

  return { sendOfferNotificationToPassengers };
};

module.exports = { createCouponOfferNotificationService };
