'use strict';
const Attempt = require('../../../../models/esewaPaymentAttemptModel');
module.exports = async function paymentReviewQueue(req, res, next) {
  try {
    const attempts = await Attempt.find({ reviewRequiredAt: { $ne: null },
      status: { $in: ['INITIATED', 'VERIFYING'] } })
      .sort({ reviewRequiredAt: 1 }).limit(100)
      .select('transactionUuid userId gatewayAmount smMoneyApplied status verificationStatus reviewRequiredAt createdAt').lean();
    return res.status(200).json({ success: true, data: attempts });
  } catch (error) { return next(error); }
};
