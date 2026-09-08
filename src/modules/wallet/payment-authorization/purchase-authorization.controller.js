'use strict';
const service = require('./purchase-authorization.service');
const { buildPassengerBookingConfirmationQuote } = require('../../booking/passenger-booking-confirmation-quote');
function endpoint(run) {
  return async (req, res) => {
    try { return await run(req, res); }
    catch (error) {
      const status = error.statusCode || 503;
      return res.status(status).json({ success: false, errorCode: 'PAYMENT_AUTHORIZATION_REQUIRED',
        message: status === 503 ? 'Payment authorization is temporarily unavailable.' : error.message });
    }
  };
}
exports.request = endpoint(async (req, res) => {
  const hold = req.bookingHold;
  const result = await buildPassengerBookingConfirmationQuote({
    gateway: req.body.gateway, tempBookingId: hold.tempBookingId,
    paymentAmount: hold.originalAmount, originalAmount: hold.originalAmount,
    couponCode: req.body.couponCode, smMoneyToUse: req.body.smMoneyToUse,
    userId: req.dbUser._id, scheduleId: hold.tripId, activeRole: req.userInfo.activeRole,
  });
  if (!result.ok) return res.status(result.statusCode).json(result.body);
  const data = await service.requestAuthorization({ user: req.dbUser, hold, body: req.body, quote: result.quote });
  return res.status(201).json({ success: true, data });
});
exports.approve = endpoint(async (req, res) => {
  const data = await service.approveAuthorization({ user: req.dbUser,
    authorizationId: req.body?.authorizationId, code: req.body?.otp });
  return res.status(200).json({ success: true, data });
});
