"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const guard = require("../../middleware/requireFinanceAdmin");

test("finance changes require the privileged role and confirmed MFA", () => {
  for (const role of [undefined, "passenger", "ADMIN", "SUB_ADMIN", "SUPER_ADMIN"]) {
    for (const twoFactorEnabled of [false, true]) {
      let next = false; let status;
      guard({ adminInfo: { role, twoFactorEnabled } }, {
        status(code) { status = code; return this; }, json() {},
      }, () => { next = true; });
      assert.equal(next, role === "SUPER_ADMIN" && twoFactorEnabled);
      if (!next) assert.equal(status, 403);
    }
  }
});
