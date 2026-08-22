"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  COOKIE_NAMES,
  readPortalRefreshToken,
  setPortalRefreshCookie,
  clearPortalRefreshCookies,
} = require("../../../utils/portalSessionCookies");

test("portal refresh cookies remain isolated with legacy migration fallback", () => {
  assert.equal(COOKIE_NAMES.passenger, "passengerRefreshToken");
  assert.equal(COOKIE_NAMES.busOwner, "busOwnerRefreshToken");
  assert.equal(COOKIE_NAMES.agent, "agentRefreshToken");
  assert.equal(readPortalRefreshToken({ cookies: {
    refreshToken: "legacy", busOwnerRefreshToken: "owner",
  }, body: {} }, "busOwner"), "owner");

  const calls = [];
  const res = {
    cookie: (...args) => calls.push(["set", ...args]),
    clearCookie: (...args) => calls.push(["clear", ...args]),
  };
  setPortalRefreshCookie(res, "passenger", "passenger-token");
  clearPortalRefreshCookies(res, "passenger");
  assert.equal(calls[0][1], "passengerRefreshToken");
  assert.deepEqual(calls.slice(1).map((call) => call[1]), [
    "passengerRefreshToken", "refreshToken",
  ]);
});
