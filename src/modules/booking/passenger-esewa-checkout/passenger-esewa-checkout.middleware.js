'use strict';

function requireServerOwnedEsewaCheckout(req, res, next) {
  if (req.body?.gateway !== 'esewa') return next();
  return res.status(409).json({
    success: false,
    message: 'Start eSewa payment through the secure checkout endpoint.',
    errorCode: 'ESEWA_CHECKOUT_REQUIRED',
  });
}

module.exports = { requireServerOwnedEsewaCheckout };
