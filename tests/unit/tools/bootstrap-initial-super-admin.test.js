"use strict";

const { test, describe, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const SuperAdmin = require("../../../models/adminModel");
const BootstrapState = require("../../../models/adminBootstrapStateModel");
const {
  createRootAtomically, requiredConfig,
} = require("../../../scripts/bootstrapInitialSuperAdmin");

describe("one-time root bootstrap", () => {
  const originals = {
    startSession: mongoose.startSession,
    adminExists: SuperAdmin.exists,
    adminCreate: SuperAdmin.create,
    stateExists: BootstrapState.exists,
    stateCreate: BootstrapState.create,
  };
  let env;

  beforeEach(() => {
    env = { ...process.env };
    process.env.SUPER_ADMIN_EMAIL = "root@example.com";
    process.env.SUPER_ADMIN_ID = "SM-ADM-DIPESH";
    process.env.SUPER_ADMIN_PASSWORD = "StrongPassword#2026!";
    process.env.ADMIN_BOOTSTRAP_ENVIRONMENT = "staging";
    process.env.ADMIN_BOOTSTRAP_CONFIRM = "CREATE_INITIAL_ROOT:staging";
  });

  afterEach(() => {
    process.env = env;
    mongoose.startSession = originals.startSession;
    SuperAdmin.exists = originals.adminExists;
    SuperAdmin.create = originals.adminCreate;
    BootstrapState.exists = originals.stateExists;
    BootstrapState.create = originals.stateCreate;
  });

  test("requires explicit environment confirmation", () => {
    process.env.ADMIN_BOOTSTRAP_CONFIRM = "wrong";
    assert.throws(() => requiredConfig(), /does not match/);
  });

  test("rejects a weak password before database access", () => {
    process.env.SUPER_ADMIN_PASSWORD = "short";
    assert.throws(() => requiredConfig(), /at least 12/);
  });

  test("accepts the canonical named administrator ID", () => {
    assert.equal(requiredConfig().adminId, "SM-ADM-DIPESH");
  });

  test("permanent bootstrap record blocks another root", async () => {
    fakeSession();
    BootstrapState.exists = queryResult(true);
    await assert.rejects(
      createRootAtomically(requiredConfig()),
      (error) => error.code === "ROOT_BOOTSTRAP_ALREADY_CONSUMED"
    );
  });

  test("existing admin data blocks bootstrap", async () => {
    fakeSession();
    BootstrapState.exists = queryResult(false);
    SuperAdmin.exists = queryResult(true);
    await assert.rejects(
      createRootAtomically(requiredConfig()),
      (error) => error.code === "ADMIN_DATA_ALREADY_EXISTS"
    );
  });

  test("creates one inactive immutable root and permanent provisioning state", async () => {
    fakeSession();
    BootstrapState.exists = queryResult(false);
    SuperAdmin.exists = queryResult(false);
    let rootInput;
    let stateInput;
    SuperAdmin.create = async ([input]) => {
      rootInput = input;
      return [{ _id: "root-id", ...input }];
    };
    BootstrapState.create = async ([input]) => { stateInput = input; };
    const result = await createRootAtomically(requiredConfig());
    assert.equal(rootInput.role, "SUPER_ADMIN");
    assert.equal(rootInput.isRootAdmin, true);
    assert.equal(rootInput.isActive, false);
    assert.equal(rootInput.lifecycleStatus, "MFA_PENDING");
    assert.notEqual(rootInput.password, process.env.SUPER_ADMIN_PASSWORD);
    assert.equal(stateInput.key, "INITIAL_ROOT_ADMIN");
    assert.equal(stateInput.rootAdminId, "root-id");
    assert.ok(stateInput.enrollmentTokenHash);
    assert.ok(result.rawToken);
  });
});

function queryResult(value) {
  return () => ({ session: async () => value });
}

function fakeSession() {
  mongoose.startSession = async () => ({
    withTransaction: async (callback) => callback(),
    endSession: async () => {},
  });
}
