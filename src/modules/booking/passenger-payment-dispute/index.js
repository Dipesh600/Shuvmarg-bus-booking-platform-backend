'use strict';

/**
 * Production composition for passenger payment dispute handling.
 */
const Transaction = require('../../../../models/transactionModel');
const logger = require('../../../../utils/logger');
const {
  createLocalNotification,
} = require('../../../../controllers/notificationController/notification_manager');
const {
  createPassengerPaymentDisputeRepository,
} = require('./passenger-payment-dispute.repository');
const {
  createPassengerPaymentDisputeService,
} = require('./passenger-payment-dispute.service');

const repository = createPassengerPaymentDisputeRepository({ Transaction });
const service = createPassengerPaymentDisputeService({
  repository,
  createLocalNotification,
  logger,
});

module.exports = {
  markPassengerPaymentDisputed: service.markPassengerPaymentDisputed,
  sendPassengerPaymentDisputeAdminAlert:
    service.sendPassengerPaymentDisputeAdminAlert,
  notifyPassengerPaymentDispute: service.notifyPassengerPaymentDispute,
};
