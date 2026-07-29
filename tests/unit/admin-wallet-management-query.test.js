"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Wallet = require("../../models/walletModel.js");
const User = require("../../models/userModel.js");
const walletService = require("../../services/walletService.js");
const ledgerService = require("../../src/modules/wallet/sm-ledger");
const queries = require(
  "../../src/modules/admin/wallet-management/wallet-user-query.service.js"
);

function patch(t, object, key, value) {
  const original = object[key];
  object[key] = value;
  t.after(() => { object[key] = original; });
}

function query(value) {
  return { select() { return this; }, async lean() { return value; } };
}

test("wallet lookup returns the legacy user, wallet, activity contract",
  async (t) => {
    const user = {
      _id: "u1", name: "Passenger", email: "p@example.com",
      phone: "9800000000", status: "active", profilePicture: "photo",
      role: "passenger", createdAt: "joined",
    };
    patch(t, User, "findOne", (filter) => {
      assert.deepEqual(filter, {
        phone: { $regex: "9800000000", $options: "i" },
      });
      return query(user);
    });
    patch(t, walletService, "getOrCreateWallet", async () => ({
      _id: "w1", currency: "NPR", status: "active", legacyBalance: 4,
      createdAt: "created", updatedAt: "updated",
    }));
    patch(t, walletService, "getFullBalance", async () => ({
      spendableBalance: 90, lockedBalance: 10, isNegative: false,
      expiringAmount: 5,
    }));
    patch(t, ledgerService, "getActivityFeed", async (id, options) => {
      assert.equal(id, "u1");
      assert.deepEqual(options, { page: 2, limit: 100 });
      return { entries: ["entry"], pagination: { page: 2 } };
    });
    assert.deepEqual(
      await queries.lookupUserWallet("9800000000", "2", "500"),
      {
        user: {
          _id: "u1", name: "Passenger", email: "p@example.com",
          phone: "9800000000", status: "active",
          profilePicture: "photo", role: "passenger", joinedAt: "joined",
        },
        wallet: {
          _id: "w1", balance: 90, lockedBalance: 10, isNegative: false,
          expiringAmount: 5, currency: "NPR", status: "active",
          legacyBalance: 4, createdAt: "created", updatedAt: "updated",
        },
        activities: ["entry"],
        pagination: { page: 2 },
      }
    );
  });

test("lightweight balance preserves absent and existing wallet contracts",
  async (t) => {
    let balanceReads = 0;
    patch(t, Wallet, "findOne", () => query(null));
    patch(t, walletService, "getFullBalance", async () => {
      balanceReads += 1;
    });
    assert.deepEqual(await queries.getUserBalance("u1"), {
      balance: 0, lockedBalance: 0, currency: "NPR",
      walletStatus: "active", exists: false,
    });
    assert.equal(balanceReads, 0);

    Wallet.findOne = () => query({ currency: "NPR", status: "frozen" });
    walletService.getFullBalance = async () => ({
      spendableBalance: 7, lockedBalance: 3,
    });
    assert.deepEqual(await queries.getUserBalance("u1"), {
      balance: 7, lockedBalance: 3, currency: "NPR",
      walletStatus: "frozen", exists: true,
    });
  });
