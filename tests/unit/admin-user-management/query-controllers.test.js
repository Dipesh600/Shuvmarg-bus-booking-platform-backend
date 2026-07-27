"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createUserDirectoryController,
  buildUserQuery,
} = require("../../../src/modules/admin/user-management/user-directory.controller");
const {
  createUserProfileController,
  mapUserProfile,
} = require("../../../src/modules/admin/user-management/user-profile.controller");
const {
  createTransactionHistoryController,
} = require("../../../src/modules/admin/user-management/transaction-history.controller");

const response = () => {
  let status;
  let body;
  return {
    status(value) { status = value; return this; },
    json(value) { body = value; return this; },
    result: () => ({ status, body }),
  };
};

test("admin user-management query controllers", async (t) => {
  await t.test("directory query escapes regex and filters allowed status", () => {
    assert.deepEqual(buildUserQuery("", ""), {
      roles: "passenger",
      deletedAt: null,
    });
    const query = buildUserQuery("a+b", "banned");
    assert.equal(query.status, "banned");
    assert.equal(query.$or[0].name.$regex, "a\\+b");
    assert.equal(query.$or[0].name.$options, "i");
  });

  await t.test("directory clamps pagination and maps booking totals", async () => {
    let input;
    const user = {
      _id: { toString: () => "u1" },
      name: "Passenger",
      roles: ["passenger"],
      status: "active",
    };
    const handler = createUserDirectoryController({
      repository: {
        findUsers: async (...args) => {
          input = args;
          return [[user], 101, [{ _id: { toString: () => "u1" }, bookingCount: 3, totalSpent: 400 }]];
        },
      },
    });
    const res = response();
    await handler({ query: { page: "-2", limit: "1000", search: " x " } }, res);
    assert.equal(input[1], 1);
    assert.equal(input[2], 100);
    assert.equal(res.result().body.data[0].bookingCount, 3);
    assert.deepEqual(res.result().body.pagination, {
      page: 1, limit: 100, totalCount: 101, totalPages: 2, hasMore: true,
    });
  });

  await t.test("profile rejects invalid ID before repository access", async () => {
    let called = false;
    const handler = createUserProfileController({
      repository: { getProfileContext: async () => { called = true; } },
      isValidObjectId: () => false,
    });
    const res = response();
    await handler({ body: { id: "bad" } }, res);
    assert.equal(called, false);
    assert.deepEqual(res.result(), {
      status: 400,
      body: { success: false, message: "Invalid user ID format!" },
    });
  });

  await t.test("profile mapping preserves metrics and security defaults", () => {
    const result = mapUserProfile(
      { referralCode: "REF", lockedUntil: new Date("2026-02-01T00:00:00Z") },
      [{ total: [{ count: 2 }], avgPerBooking: [{ avg: 10.6 }] }],
      ["audit"],
      3,
      () => new Date("2026-01-01T00:00:00Z")
    );
    assert.equal(result.metrics.bookings.total, 2);
    assert.equal(result.metrics.bookings.avgPerBooking, 11);
    assert.equal(result.security.accountLocked, true);
    assert.equal(result.security.activeSessions, 3);
    assert.equal(result.referral.code, "REF");
    assert.deepEqual(result.auditLog, ["audit"]);
  });

  await t.test("transaction history preserves query chain and pagination", async () => {
    const calls = [];
    const query = {
      sort(value) { calls.push(["sort", value]); return this; },
      skip(value) { calls.push(["skip", value]); return this; },
      limit(value) { calls.push(["limit", value]); return this; },
      populate(...value) { calls.push(["populate", ...value]); return this; },
      lean() { return Promise.resolve(["txn"]); },
    };
    const handler = createTransactionHistoryController({
      Transaction: {
        find: (value) => (calls.push(["find", value]), query),
        countDocuments: async () => 5,
      },
      isValidObjectId: () => true,
    });
    const res = response();
    await handler({ params: { id: "u" }, query: { page: "2", limit: "2" } }, res);
    assert.deepEqual(calls[0], ["find", { userId: "u" }]);
    assert.deepEqual(calls[2], ["skip", 2]);
    assert.equal(res.result().status, 200);
    assert.deepEqual(res.result().body.pagination, {
      page: 2, limit: 2, totalCount: 5, totalPages: 3,
    });
  });
});
