"use strict";

const mongoose = require("mongoose");
const Referral = require("../../../../models/referralV2Model");
const User = require("../../../../models/userModel");
const Booking = require("../../../../models/bookTicketModel");
const SMLedger = require("../../../../models/smLedgerModel");
const smLedgerService = require("../../wallet/sm-ledger");
const {
  createLocalNotification,
} = require("../../../../controllers/notificationController/notification_manager");
const constants = require("./referral-reward.constants");
const policy = require("./referral-reward.policy");
const {
  createReferralRewardRepository,
} = require("./referral-reward.repository");
const {
  createReferralNotificationService,
} = require("./referral-notification.service");
const {
  createReferralFraudService,
} = require("./referral-fraud.service");
const {
  createReferralCreationService,
} = require("./referral-creation.service");
const {
  createReferralUnlockService,
} = require("./referral-unlock.service");
const {
  createReferralQueryService,
} = require("./referral-query.service");
const {
  createReferralVoidService,
} = require("./referral-void.service");

const repository = createReferralRewardRepository({
  Referral,
  User,
  Booking,
  SMLedger,
});
const notificationService = createReferralNotificationService({
  createLocalNotification,
});
const fraudService = createReferralFraudService({ repository });

const createReferral = createReferralCreationService({
  mongoose,
  repository,
  smLedgerService,
  policy,
  fraudService,
  notificationService,
});
const processJourneyCompletion = createReferralUnlockService({
  mongoose,
  repository,
  smLedgerService,
  policy,
  notificationService,
});
const queryService = createReferralQueryService({ repository });
const voidReferral = createReferralVoidService({
  mongoose,
  repository,
  smLedgerService,
});

module.exports = {
  createReferral,
  processJourneyCompletion,
  getReferralDashboard: queryService.getReferralDashboard,
  getReferralStatus: queryService.getReferralStatus,
  voidReferral,
  getUnlockAmount: constants.getUnlockAmount,
  UNLOCK_SCHEDULE: constants.UNLOCK_SCHEDULE,
  TOTAL_REFERRAL_REWARD: constants.TOTAL_REFERRAL_REWARD,
};
