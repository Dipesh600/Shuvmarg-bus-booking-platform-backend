'use strict';

const createState = () => ({
  walletDebitEntryId: null,
  splitPaymentDebitEntryId: null,
  txnRecord: null,
  seatsLocked: false,
  lockedSeatNumbers: [],
  lockUserId: null,
  lockTripId: null,
  bookingCreated: false,
  bookingCommitted: false,
  booking: null,
  ticketId: null,
  committedBookingResponse: null,
  holdId: null,
  holdExpiresAt: null,
  holdClaimed: false,
});

function createPassengerBookingConfirmationOrchestrator(deps) {
  return async function orchestratePassengerBookingConfirmation({ req, res }) {
    const state = createState();
    try {
      if (!req.body || Object.keys(req.body).length === 0) {
        return {
          statusCode: 400,
          body: { success: false, message: 'your body is empty please add' },
        };
      }

      const paymentResult = await deps.runPaymentStage({ req, state });
      if (paymentResult) return paymentResult;

      const fulfillmentResult = await deps.runFulfillmentStage(state);
      if (fulfillmentResult) return fulfillmentResult;

      return await deps.runSuccessStage({ req, state });
    } catch (error) {
      return deps.handleFailure({ error, req, res, state });
    }
  };
}

module.exports = {
  createPassengerBookingConfirmationOrchestrator,
};
