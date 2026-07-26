'use strict';

/**
 * src/modules/booking/passenger-transaction-success-reconciliation/index.js
 * Production entry point for passenger transaction success reconciliation module.
 */

const Transaction = require('../../../../models/transactionModel');
const { createPassengerTransactionSuccessReconciliationRepository } = require('./passenger-transaction-success-reconciliation.repository');
const { mapPassengerTransactionReconciliationNotApplied } = require('./passenger-transaction-success-reconciliation.mapper');
const { createPassengerTransactionSuccessReconciliationService } = require('./passenger-transaction-success-reconciliation.service');

const repository = createPassengerTransactionSuccessReconciliationRepository({ Transaction });
const mapper = { mapPassengerTransactionReconciliationNotApplied };
const service = createPassengerTransactionSuccessReconciliationService({ repository, mapper });

module.exports = {
  reconcilePassengerTransactionSuccess: (params) =>
    service.reconcilePassengerTransactionSuccess(params),
};
