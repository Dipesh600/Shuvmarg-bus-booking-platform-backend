"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  createSmLedgerActivityService,
} = require("../../../src/modules/wallet/sm-ledger/sm-ledger-activity.service");

function query(entries, calls) {
  return {
    sort(value) { calls.push(["sort", value]); return this; },
    skip(value) { calls.push(["skip", value]); return this; },
    limit(value) { calls.push(["limit", value]); return this; },
    populate(...value) { calls.push(["populate", ...value]); return this; },
    lean() { return Promise.resolve(entries); },
  };
}

test("SM ledger activity and ownership contracts", async (t) => {
  await t.test("activity preserves filter, pagination, and booking population", async () => {
    const calls = [];
    let match;
    const service = createSmLedgerActivityService({
      SMLedger: {
        find: (value) => ((match = value), query([{ _id: 1 }, { _id: 2 }], calls)),
        countDocuments: async () => 7,
      },
      toObjectId: (value) => `oid:${value}`,
    });
    const result = await service("u1", { page: 2, limit: 2, typeFilter: "spent" });
    assert.deepEqual(match, {
      userId: "oid:u1",
      type: { $in: ["DEBIT", "DEBIT_REVERSAL"] },
    });
    assert.deepEqual(calls, [
      ["sort", { createdAt: -1 }],
      ["skip", 2],
      ["limit", 2],
      ["populate", "bookingId", "ticketId seats"],
    ]);
    assert.deepEqual(result.pagination, {
      page: 2, limit: 2, totalCount: 7, totalPages: 4, hasMore: true,
    });
  });

  await t.test("all and named filters preserve exact mappings", async () => {
    const matches = [];
    const service = createSmLedgerActivityService({
      SMLedger: {
        find: (value) => (matches.push(value), query([], [])),
        countDocuments: async () => 0,
      },
      toObjectId: (value) => value,
    });
    for (const typeFilter of ["all", "cashback", "referral", "refunds"]) {
      await service("u", { typeFilter });
    }
    assert.equal(matches[0].type, undefined);
    assert.deepEqual(matches[1].type, { $in: ["CASHBACK", "CASHBACK_CLAWBACK"] });
    assert.deepEqual(matches[2].type, { $in: ["REFERRAL_LOCKED", "REFERRAL_UNLOCK"] });
    assert.equal(matches[3].type, "REFUND");
  });

  await t.test("public module preserves exactly eleven legacy operations", () => {
    const ledger = require("../../../src/modules/wallet/sm-ledger");
    assert.deepEqual(Object.keys(ledger).sort(), [
      "calculateCashbackAmount",
      "clawbackCashback",
      "computeLockedBalance",
      "computeSpendableBalance",
      "creditLedger",
      "debitLedgerFIFO",
      "debitLedgerSimple",
      "generateCashback",
      "getActivityFeed",
      "getExpiringCredits",
      "reverseDebit",
    ]);
  });

  await t.test("legacy service is deleted and no production import remains", () => {
    const root = path.resolve(__dirname, "../../..");
    assert.equal(fs.existsSync(path.join(root, "services/smLedgerService.js")), false);
    const productionRoots = ["controllers", "services", "src"];
    const oldImport = /services\/smLedgerService|require\(["']\.\/smLedgerService/;
    function inspect(directory) {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const file = path.join(directory, entry.name);
        if (entry.isDirectory()) inspect(file);
        else if (entry.name.endsWith(".js")) {
          assert.equal(oldImport.test(fs.readFileSync(file, "utf8")), false, file);
        }
      }
    }
    productionRoots.forEach((directory) => inspect(path.join(root, directory)));
  });
});
