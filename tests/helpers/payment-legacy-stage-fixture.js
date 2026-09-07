'use strict';
// Legacy stage contracts mock persistence. Replica-set tests cover the atomic path.
module.exports = (stages, mockMethod) => {
  const create = stages.createPassengerBookingConfirmationFulfillmentStage;
  mockMethod(stages, 'createPassengerBookingConfirmationFulfillmentStage', deps => create({ ...deps, atomicSeatCommit: false }));
};
