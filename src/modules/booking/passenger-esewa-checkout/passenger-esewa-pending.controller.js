'use strict';

// Return recovery identifiers only. Signed forms, PIN authorization and another
// passenger's attempts must never be exposed by this discovery endpoint.
function createPendingCheckoutController({ Attempt }) {
  return async function pendingPassengerEsewaCheckout(req, res, next) {
    try {
      const attempts = await Attempt.find({
        userId: req.dbUser._id,
        status: { $in: ['INITIATED', 'VERIFYING'] },
      }).sort({ createdAt: 1 }).limit(20).select('transactionUuid status createdAt -_id').lean();
      return res.status(200).json({ success: true, data: { attempts } });
    } catch (error) { return next(error); }
  };
}
module.exports = { createPendingCheckoutController };
