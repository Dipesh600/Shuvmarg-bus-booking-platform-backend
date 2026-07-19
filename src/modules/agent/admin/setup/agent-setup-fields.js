'use strict';

const REQUEST_FIELDS = [
  'id',
  'agentType',
  'linkedOperatorId',
  'busAccessScope',
  'allowedRouteIds',
  'commissionRate',
  'minSettlementThreshold',
  'adminNotes',
  'district',
  'municipality',
  'businessName',
  'shopAddress',
  'operationType',
  'claimedMonthlyVolume',
  'currentOperators',
  'settlementMethod',
  'bankName',
  'bankAccountNumber',
  'bankAccountName',
  'esewaNumber',
  'khaltiNumber',
];

const TRUTHY_AGENT_FIELDS = [
  'district',
  'municipality',
  'businessName',
  'shopAddress',
  'operationType',
  'claimedMonthlyVolume',
  'currentOperators',
  'settlementMethod',
  'bankName',
  'bankAccountNumber',
  'bankAccountName',
  'esewaNumber',
  'khaltiNumber',
];

const NUMBER_FIELDS = ['commissionRate', 'minSettlementThreshold'];

module.exports = {
  REQUEST_FIELDS,
  TRUTHY_AGENT_FIELDS,
  NUMBER_FIELDS,
};
