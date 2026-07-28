"use strict";

const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("../../../../models/userModel");
const Booking = require("../../../../models/bookTicketModel");
const Transaction = require("../../../../models/transactionModel");
const AdminAuditLog = require("../../../../models/adminAuditLogModel");
const RefreshToken = require("../../../../models/refreshTokenModel");
const UserDeviceInfo = require("../../../../models/userDeviceInfoModel");
const notifications = require("../../../../controllers/notificationController/notification_manager");
const { createUserManagementSupportService } = require("./user-management-support.service");
const { createPasswordResetController } = require("./password-reset.controller");
const { createAccountDeletionController } = require("./account-deletion.controller");
const { createUserProfileRepository } = require("./user-profile.repository");
const { createUserProfileController } = require("./user-profile.controller");
const { createUserDirectoryRepository } = require("./user-directory.repository");
const { createUserDirectoryController } = require("./user-directory.controller");
const { createUserStatusController } = require("./user-status.controller");
const { createTransactionHistoryController } = require("./transaction-history.controller");

const support = createUserManagementSupportService({
  RefreshToken,
  AdminAuditLog,
  UserDeviceInfo,
  ...notifications,
});
const shared = {
  User,
  isValidObjectId: mongoose.Types.ObjectId.isValid,
  support,
};
const profileRepository = createUserProfileRepository({
  User,
  Booking,
  AdminAuditLog,
  RefreshToken,
  toObjectId: (id) => new mongoose.Types.ObjectId(id),
});

module.exports = {
  changeUserPassword: createPasswordResetController({ ...shared, bcrypt }),
  deleteAccount: createAccountDeletionController({ ...shared, Booking }),
  getUserById: createUserProfileController({
    repository: profileRepository,
    isValidObjectId: shared.isValidObjectId,
  }),
  getAllUsers: createUserDirectoryController({
    repository: createUserDirectoryRepository({ User, Booking }),
  }),
  updateUserStatus: createUserStatusController(shared),
  getUserTransactions: createTransactionHistoryController({
    Transaction,
    isValidObjectId: shared.isValidObjectId,
  }),
};
