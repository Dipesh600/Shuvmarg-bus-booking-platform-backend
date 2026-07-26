'use strict';

/**
 * src/modules/booking/passenger-esewa-verification/passenger-esewa-verification.service.js
 * Service factory for passenger eSewa payment verification.
 */

function createPassengerEsewaVerificationService({
  verifyEsewaPayment,
  logger,
  mapper,
}) {
  if (typeof verifyEsewaPayment !== 'function') {
    throw new Error('createPassengerEsewaVerificationService requires verifyEsewaPayment function');
  }
  if (!mapper || typeof mapper.mapEsewaParametersMissing !== 'function' || typeof mapper.mapEsewaVerificationFailure !== 'function') {
    throw new Error('createPassengerEsewaVerificationService requires mapper with mapEsewaParametersMissing and mapEsewaVerificationFailure');
  }

  async function verifyPassengerEsewaPayment({
    gateway,
    paymentId,
    gatewayAmount,
    userId,
  } = {}) {
    if (gateway !== 'esewa') {
      return {
        ok: true,
        applied: false,
        verified: false,
      };
    }

    if (!paymentId || !gatewayAmount) {
      return mapper.mapEsewaParametersMissing();
    }

    const esewaCheck = await verifyEsewaPayment(paymentId, gatewayAmount);

    if (!esewaCheck || !esewaCheck.verified) {
      const reason = (esewaCheck && esewaCheck.error) != null ? esewaCheck.error : 'Unknown verification error';
      if (logger && typeof logger.warn === 'function') {
        logger.warn('confirmBooking: eSewa verification failed', {
          paymentId,
          gatewayAmount,
          userId,
          reason,
        });
      }
      return mapper.mapEsewaVerificationFailure(reason);
    }

    if (logger && typeof logger.info === 'function') {
      logger.info('confirmBooking: eSewa payment verified', {
        paymentId,
        userId,
        gatewayAmount,
      });
    }

    return {
      ok: true,
      applied: true,
      verified: true,
    };
  }

  return {
    verifyPassengerEsewaPayment,
  };
}

module.exports = {
  createPassengerEsewaVerificationService,
};
