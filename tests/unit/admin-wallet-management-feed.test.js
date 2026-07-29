"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Ledger = require("../../models/smLedgerModel.js");
const feed = require(
  "../../src/modules/admin/wallet-management/global-ledger-feed.service.js"
);

function patch(t, object, key, value) {
  const original = object[key];
  object[key] = value;
  t.after(() => { object[key] = original; });
}

test("global feed preserves filtering, pagination, population, and daily stats",
  async (t) => {
    const calls = {};
    patch(t, Ledger, "find", (match) => {
      calls.match = match;
      return {
        sort(value) { calls.sort = value; return this; },
        skip(value) { calls.skip = value; return this; },
        limit(value) { calls.limit = value; return this; },
        populate(value) {
          (calls.populate ||= []).push(value);
          return this;
        },
        async lean() { return [{ _id: "entry" }]; },
      };
    });
    patch(t, Ledger, "countDocuments", async (match) => {
      assert.deepEqual(match, {
        type: { $in: ["ADMIN_CREDIT", "ADMIN_DEBIT"] },
      });
      return 51;
    });
    patch(t, Ledger, "aggregate", async (pipeline) => {
      assert.ok(pipeline[0].$match.createdAt.$gte instanceof Date);
      return [
        { _id: "CREDIT", count: 3, totalAmount: 12.345 },
        { _id: "DEBIT", count: 2, totalAmount: 4.444 },
      ];
    });
    assert.deepEqual(
      await feed.getGlobalLedgerFeed({
        type: "admin", page: "2", limit: "25",
      }),
      {
        entries: [{ _id: "entry" }],
        stats: {
          totalCreditsToday: 3,
          totalDebitsToday: 2,
          totalCreditAmountToday: 12.35,
          totalDebitAmountToday: 4.44,
        },
        pagination: {
          page: 2, limit: 25, totalCount: 51,
          totalPages: 3, hasMore: true,
        },
      }
    );
    assert.deepEqual(calls.match, {
      type: { $in: ["ADMIN_CREDIT", "ADMIN_DEBIT"] },
    });
    assert.deepEqual(calls.sort, { createdAt: -1 });
    assert.equal(calls.skip, 25);
    assert.equal(calls.limit, 25);
    assert.deepEqual(calls.populate, [
      { path: "userId", select: "name phone" },
      { path: "bookingId", select: "ticketId" },
    ]);
  });

test("global feed clamps invalid pagination and preserves empty daily stats",
  async (t) => {
    patch(t, Ledger, "find", () => ({
      sort() { return this; },
      skip(value) { assert.equal(value, 0); return this; },
      limit(value) { assert.equal(value, 25); return this; },
      populate() { return this; },
      async lean() { return []; },
    }));
    patch(t, Ledger, "countDocuments", async () => 0);
    patch(t, Ledger, "aggregate", async () => []);
    const result = await feed.getGlobalLedgerFeed({
      page: "-5", limit: "invalid",
    });
    assert.deepEqual(result.pagination, {
      page: 1, limit: 25, totalCount: 0, totalPages: 0, hasMore: false,
    });
    assert.deepEqual(result.stats, {
      totalCreditsToday: 0, totalDebitsToday: 0,
      totalCreditAmountToday: 0, totalDebitAmountToday: 0,
    });
  });
