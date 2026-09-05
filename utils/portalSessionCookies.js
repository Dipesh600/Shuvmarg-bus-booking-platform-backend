"use strict";

const COOKIE_NAMES = Object.freeze({
  passenger: "passengerRefreshToken",
  busOwner: "busOwnerRefreshToken",
  agent: "agentRefreshToken",
  driver: "driverRefreshToken",
});

function cookieOptions(includeMaxAge = false) {
  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "Lax",
  };
  if (includeMaxAge) options.maxAge = 7 * 24 * 60 * 60 * 1000;
  return options;
}

function readPortalRefreshToken(req, portal) {
  const name = COOKIE_NAMES[portal];
  return req.cookies?.[name] || req.cookies?.refreshToken || req.body?.refreshToken;
}

function setPortalRefreshCookie(res, portal, token) {
  if (token) res.cookie(COOKIE_NAMES[portal] || COOKIE_NAMES.passenger, token, cookieOptions(true));
}

function clearPortalRefreshCookies(res, portal) {
  const options = cookieOptions(false);
  res.clearCookie(COOKIE_NAMES[portal], options);
  res.clearCookie("refreshToken", options);
}

module.exports = {
  COOKIE_NAMES,
  cookieOptions,
  readPortalRefreshToken,
  setPortalRefreshCookie,
  clearPortalRefreshCookies,
};
