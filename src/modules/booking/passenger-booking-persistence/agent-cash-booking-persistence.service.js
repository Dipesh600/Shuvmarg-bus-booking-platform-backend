'use strict';

const createAgentCashBookingPersistenceService = ({
  repository,
  mapper,
  generateTicketId,
}) => {
  if (!repository || typeof repository.createBooking !== 'function') {
    throw new TypeError('agent cash persistence requires the shared booking repository');
  }
  if (!mapper || typeof mapper.mapAgentCashBookingPayload !== 'function') {
    throw new TypeError('agent cash persistence requires its allowlist mapper');
  }
  if (typeof generateTicketId !== 'function') {
    throw new TypeError('agent cash persistence requires a ticket generator');
  }

  const persistAgentCashBooking = async (params) => {
    const ticketId = generateTicketId();
    const payload = mapper.mapAgentCashBookingPayload({ ...params, ticketId });
    const booking = await repository.createBooking(payload);
    return { booking, ticketId };
  };

  return { persistAgentCashBooking };
};

module.exports = { createAgentCashBookingPersistenceService };
