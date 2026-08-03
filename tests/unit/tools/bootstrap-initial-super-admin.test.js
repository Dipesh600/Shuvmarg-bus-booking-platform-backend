'use strict';

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const SuperAdmin = require('../../../models/adminModel.js');
const { bootstrapInitialSuperAdmin } = require('../../../scripts/bootstrapInitialSuperAdmin.js');

describe('Initial Super-Admin Bootstrap Unit Tests', () => {
  let envBackup;
  let exitCodeBackup;
  let connectCalled;
  let disconnectCalled;
  let countDocumentsResult;
  let createCalledWith;

  const originalConnect = mongoose.connect;
  const originalClose = mongoose.connection.close;
  const originalCountDocuments = SuperAdmin.countDocuments;
  const originalCreate = SuperAdmin.create;

  beforeEach(() => {
    envBackup = { ...process.env };
    exitCodeBackup = process.exitCode;
    process.exitCode = undefined;

    connectCalled = false;
    disconnectCalled = false;
    countDocumentsResult = 0;
    createCalledWith = null;

    // Reset required env vars for tests
    delete process.env.SUPER_ADMIN_EMAIL;
    delete process.env.SUPER_ADMIN_ID;
    delete process.env.SUPER_ADMIN_PASSWORD;
    delete process.env.MONGODB_URL;
  });

  afterEach(() => {
    process.env = envBackup;
    process.exitCode = exitCodeBackup;

    // Restore original methods
    mongoose.connect = originalConnect;
    mongoose.connection.close = originalClose;
    SuperAdmin.countDocuments = originalCountDocuments;
    SuperAdmin.create = originalCreate;
  });

  test('Missing environment variables: DB and creation are not called, exitCode set to 1', async () => {
    process.env.SUPER_ADMIN_EMAIL = 'admin@example.com';
    // SUPER_ADMIN_ID and SUPER_ADMIN_PASSWORD missing

    mongoose.connect = async () => {
      connectCalled = true;
    };
    SuperAdmin.countDocuments = async () => {
      return 0;
    };
    SuperAdmin.create = async (data) => {
      createCalledWith = data;
    };

    await bootstrapInitialSuperAdmin();

    assert.equal(connectCalled, false, 'DB connect should not be called when env vars are missing');
    assert.equal(createCalledWith, null, 'SuperAdmin.create should not be called when env vars are missing');
    assert.equal(process.exitCode, 1, 'process.exitCode should be set to 1 on missing env vars');
  });

  test('Weak password: DB and creation are not called, exitCode set to 1', async () => {
    process.env.SUPER_ADMIN_EMAIL = 'admin@example.com';
    process.env.SUPER_ADMIN_ID = 'SUMA-ADM-001';
    process.env.SUPER_ADMIN_PASSWORD = 'short'; // Fails length >= 12

    mongoose.connect = async () => {
      connectCalled = true;
    };
    SuperAdmin.countDocuments = async () => {
      return 0;
    };
    SuperAdmin.create = async (data) => {
      createCalledWith = data;
    };

    await bootstrapInitialSuperAdmin();

    assert.equal(connectCalled, false, 'DB connect should not be called on weak password');
    assert.equal(createCalledWith, null, 'SuperAdmin.create should not be called on weak password');
    assert.equal(process.exitCode, 1, 'process.exitCode should be set to 1 on weak password');
  });

  test('Existing super admin: SuperAdmin.create is not called, exitCode set to 1, DB cleanup called', async () => {
    process.env.MONGODB_URL = 'mongodb://localhost:27017/test-db';
    process.env.SUPER_ADMIN_EMAIL = 'admin@example.com';
    process.env.SUPER_ADMIN_ID = 'SUMA-ADM-001';
    process.env.SUPER_ADMIN_PASSWORD = 'StrongPassword#2026!';

    mongoose.connect = async () => {
      connectCalled = true;
    };
    mongoose.connection.close = async () => {
      disconnectCalled = true;
    };
    SuperAdmin.countDocuments = async () => {
      return 1; // Existing super admin found
    };
    SuperAdmin.create = async (data) => {
      createCalledWith = data;
    };

    await bootstrapInitialSuperAdmin();

    assert.equal(connectCalled, true, 'DB connect should be called');
    assert.equal(createCalledWith, null, 'SuperAdmin.create must not be called when super admin exists');
    assert.equal(process.exitCode, 1, 'process.exitCode should be set to 1 when super admin exists');
    assert.equal(disconnectCalled, true, 'Mongoose connection close must be called in finally block');
  });

  test('No existing super admin: password is hashed, exactly one account created, DB cleanup called', async () => {
    process.env.MONGODB_URL = 'mongodb://localhost:27017/test-db';
    process.env.SUPER_ADMIN_EMAIL = 'admin@example.com';
    process.env.SUPER_ADMIN_ID = 'SUMA-ADM-001';
    process.env.SUPER_ADMIN_PASSWORD = 'StrongPassword#2026!';

    mongoose.connect = async () => {
      connectCalled = true;
    };
    mongoose.connection.close = async () => {
      disconnectCalled = true;
    };
    SuperAdmin.countDocuments = async () => {
      return 0; // No existing super admin
    };
    SuperAdmin.create = async (data) => {
      createCalledWith = data;
      return { _id: 'mock-id', ...data };
    };

    await bootstrapInitialSuperAdmin();

    assert.equal(connectCalled, true, 'DB connect should be called');
    assert.notEqual(createCalledWith, null, 'SuperAdmin.create should be called');
    assert.equal(createCalledWith.email, 'admin@example.com');
    assert.equal(createCalledWith.adminId, 'SUMA-ADM-001');
    assert.notEqual(createCalledWith.password, 'StrongPassword#2026!', 'Password must be hashed before save');
    assert.equal(process.exitCode, undefined, 'process.exitCode should not be set to 1 on success');
    assert.equal(disconnectCalled, true, 'Mongoose connection close must be called in finally block');
  });
});
