"use strict";
const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { mongoose } = require("../helpers/payment-reversal-harness");
const User = require("../../models/userModel");
const Wallet = require("../../models/walletModel");
const Operation = require("../../models/financialOperationModel");
const { changeWalletStatus } = require("../../src/modules/admin/wallet-management/wallet-status.service");
let userId;
beforeEach(async () => {
  await Operation.init(); await Operation.deleteMany({}); await Wallet.deleteMany({}); await User.deleteMany({});
  userId = new mongoose.Types.ObjectId();
  await User.collection.insertOne({ _id: userId, name: "Passenger", phone: "9800000000" });
  await Wallet.create({ userId });
});
const input = { adminId: "admin-1", operationId: "freeze_operation_1234", remarks: "Account security review" };
test("freeze records the actor and reason once and an old retry cannot undo a later unfreeze", async () => {
  await Promise.all(Array.from({ length: 10 }, () => changeWalletStatus(userId, 'freeze', input)));
  assert.equal(await Operation.countDocuments({}), 1);
  const audit = await Operation.findOne();
  assert.equal(audit.actorId, input.adminId);
  assert.equal(audit.payload.remarks, input.remarks);
  await changeWalletStatus(userId, 'unfreeze', { ...input, operationId: 'unfreeze_operation_1234' });
  await changeWalletStatus(userId, 'freeze', input);
  assert.equal((await Wallet.findOne({ userId })).status, 'active');
  await assert.rejects(() => changeWalletStatus(userId, 'freeze', { ...input, adminId: 'admin-2' }), /different money change/);
});
test("missing audit identity or operation key cannot change the wallet", async () => {
  await assert.rejects(() => changeWalletStatus(userId, 'freeze'), /Administrator/);
  await assert.rejects(() => changeWalletStatus(userId, 'freeze', { ...input, operationId: undefined }), /operationId/);
  assert.equal((await Wallet.findOne({ userId })).status, 'active');
});
