"use strict";

function readEsewaEnvironment(env = process.env) {
  const sandbox = env.NODE_ENV !== "production" || env.DEPLOYMENT_ENV === "staging";
  return {
    sandbox,
    paymentHost: sandbox ? "rc-epay.esewa.com.np" : "epay.esewa.com.np",
    statusHosts: sandbox ? ["rc.esewa.com.np", "rc-epay.esewa.com.np"] : ["esewa.com.np", "epay.esewa.com.np"],
  };
}

function isTrustedEsewaUrl(value, hosts) {
  try {
    const target = new URL(value);
    return target.protocol === "https:" && hosts.includes(target.hostname)
      && !target.username && !target.password && !target.port && !target.hash && !target.search;
  } catch { return false; }
}

function assertEsewaAttemptEnvironment(attempt, config) {
  if ((config.productCode && attempt.productCode !== config.productCode)
    || (attempt.paymentEnvironment && attempt.paymentEnvironment !== config.paymentEnvironment)) {
    throw Object.assign(new Error("Payment configuration changed. This attempt requires review."), {
      code: "ESEWA_CONFIGURATION_INVALID",
    });
  }
}

module.exports = { readEsewaEnvironment, isTrustedEsewaUrl, assertEsewaAttemptEnvironment };
