"use strict";

const mongoose = require("mongoose");
const SMLedger = require("../../../../models/smLedgerModel");
const ScratchCard = require("../../../../models/scratchCardModel");
const PlatformConfig = require("../../../../models/platformConfigModel");
const { createLedgerIdConverter } = require("./sm-ledger-id");
const { createSmLedgerBalanceService } = require("./sm-ledger-balance.service");
const { createSmLedgerEntryService } = require("./sm-ledger-entry.service");
const { createSmLedgerFifoDebitService } = require("./sm-ledger-fifo-debit.service");
const cashbackPolicy = require("./sm-ledger-cashback.policy");
const { createSmLedgerCashbackService } = require("./sm-ledger-cashback.service");
const { createSmLedgerClawbackService } = require("./sm-ledger-clawback.service");
const { createSmLedgerReversalService } = require("./sm-ledger-reversal.service");
const { createSmLedgerActivityService } = require("./sm-ledger-activity.service");

const toObjectId = createLedgerIdConverter(mongoose);
const entries = createSmLedgerEntryService({ SMLedger, PlatformConfig });
const balances = createSmLedgerBalanceService({ SMLedger, toObjectId });
const debitLedgerFIFO = createSmLedgerFifoDebitService({
  mongoose,
  SMLedger,
  toObjectId,
});
const generateCashback = createSmLedgerCashbackService({
  mongoose,
  ScratchCard,
  PlatformConfig,
  creditLedger: entries.creditLedger,
  ...cashbackPolicy,
});
const clawbackCashback = createSmLedgerClawbackService({
  mongoose,
  SMLedger,
  ScratchCard,
  debitLedgerSimple: entries.debitLedgerSimple,
});
const reverseDebit = createSmLedgerReversalService({
  mongoose,
  SMLedger,
  creditLedger: entries.creditLedger,
});
const getActivityFeed = createSmLedgerActivityService({ SMLedger, toObjectId });

module.exports = {
  ...balances,
  ...entries,
  debitLedgerFIFO,
  generateCashback,
  calculateCashbackAmount: cashbackPolicy.calculateCashbackAmount,
  clawbackCashback,
  reverseDebit,
  getActivityFeed,
};
