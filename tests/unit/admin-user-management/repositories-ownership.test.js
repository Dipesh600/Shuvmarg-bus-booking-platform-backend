"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  createUserDirectoryRepository,
  USER_FIELDS,
} = require("../../../src/modules/admin/user-management/user-directory.repository");

test("admin user-management repository and ownership contracts", async (t) => {
  await t.test("directory repository preserves query chain and aggregate", async () => {
    const calls = [];
    const query = {
      select(value) { calls.push(["select", value]); return this; },
      sort(value) { calls.push(["sort", value]); return this; },
      skip(value) { calls.push(["skip", value]); return this; },
      limit(value) { calls.push(["limit", value]); return this; },
      lean() { return Promise.resolve(["user"]); },
    };
    let pipeline;
    const repository = createUserDirectoryRepository({
      User: {
        find: (value) => (calls.push(["find", value]), query),
        countDocuments: async () => 1,
      },
      Booking: { aggregate: async (value) => ((pipeline = value), []) },
    });
    assert.deepEqual(await repository.findUsers({ status: "active" }, 2, 10), [
      ["user"], 1, [],
    ]);
    assert.deepEqual(calls, [
      ["find", { status: "active" }],
      ["select", USER_FIELDS],
      ["sort", { createdAt: -1 }],
      ["skip", 10],
      ["limit", 10],
    ]);
    assert.deepEqual(pipeline[0], { $match: { status: "booked" } });
  });

  await t.test("legacy controller and baseline entry are gone", () => {
    const root = path.resolve(__dirname, "../../..");
    assert.equal(
      fs.existsSync(
        path.join(root, "controllers/adminController/adminController.js")
      ),
      false
    );
    const baseline = fs.readFileSync(
      path.join(root, "config/refactor-file-size-baseline.json"),
      "utf8"
    );
    assert.equal(baseline.includes("adminController/adminController.js"), false);
  });

  await t.test("router owns the new module and no production import remains", () => {
    const root = path.resolve(__dirname, "../../..");
    const router = fs.readFileSync(
      path.join(root, "routes/adminRoutes/adminRoutes.js"),
      "utf8"
    );
    assert.match(router, /src\/modules\/admin\/user-management/);
    assert.doesNotMatch(router, /adminController\/adminController/);
    const moduleFiles = fs
      .readdirSync(path.join(root, "src/modules/admin/user-management"))
      .filter((file) => file.endsWith(".js"));
    assert.equal(moduleFiles.length, 10);
  });
});
