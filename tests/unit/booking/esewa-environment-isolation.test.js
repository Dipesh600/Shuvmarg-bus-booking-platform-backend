"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const dotenv = require("dotenv");
const { readEsewaCheckoutConfig } = require("../../../src/modules/booking/passenger-esewa-checkout/passenger-esewa-checkout.config");
const { readVerificationConfig } = require("../../../services/esewaVerificationService");
const { parseEsewaAmount } = require("../../../src/shared/esewa-amount");
const base = { NODE_ENV: "production", ESEWA_PRODUCT_CODE: "LIVE-MERCHANT", ESEWA_SECRET_KEY: "test-secret", PASSENGER_APP_URL: "https://passenger.example" };
test("live checkout and verification use the same live environment", () => {
  assert.equal(readEsewaCheckoutConfig(base).paymentEnvironment, "live");
  assert.equal(new URL(readEsewaCheckoutConfig(base).paymentUrl).hostname, "epay.esewa.com.np");
  assert.equal(new URL(readVerificationConfig(base).baseUrl).hostname, "esewa.com.np");
});
test("staging with production Node settings uses sandbox on both sides", () => {
  const env = { ...base, DEPLOYMENT_ENV: "staging", ESEWA_PRODUCT_CODE: "EPAYTEST" };
  assert.equal(readEsewaCheckoutConfig(env).paymentEnvironment, "sandbox");
  assert.equal(new URL(readEsewaCheckoutConfig(env).paymentUrl).hostname, "rc-epay.esewa.com.np");
  assert.equal(new URL(readVerificationConfig(env).baseUrl).hostname, "rc.esewa.com.np");
});
test("staging Compose enforces sandbox selection and requires a return URL", () => {
  const compose = fs.readFileSync(path.resolve(__dirname, "../../../deploy/staging/docker-compose.yml"), "utf8");
  assert.match(compose, /DEPLOYMENT_ENV: "staging"/);
  assert.match(compose, /PASSENGER_APP_URL: "\$\{PASSENGER_APP_URL:\?/);
});
test("live configuration cannot use test credentials or sandbox endpoints", () => {
  assert.throws(() => readEsewaCheckoutConfig({ ...base, ESEWA_PRODUCT_CODE: "EPAYTEST" }));
  assert.throws(() => readVerificationConfig({ ...base, ESEWA_PRODUCT_CODE: "EPAYTEST" }));
  assert.throws(() => readEsewaCheckoutConfig({ ...base, ESEWA_PAYMENT_URL: "https://rc-epay.esewa.com.np/form" }));
  assert.throws(() => readVerificationConfig({ ...base, ESEWA_STATUS_URL: "https://rc.esewa.com.np/status" }));
});
test("sandbox configuration cannot use live endpoints", () => {
  const env = { ...base, DEPLOYMENT_ENV: "staging" };
  assert.throws(() => readEsewaCheckoutConfig({ ...env, ESEWA_PAYMENT_URL: "https://epay.esewa.com.np/form" }));
  assert.throws(() => readVerificationConfig({ ...env, ESEWA_STATUS_URL: "https://esewa.com.np/status" }));
});
test("payment destinations reject arbitrary subdomains, credentials and nonstandard ports", () => {
  for (const url of ["https://other.esewa.com.np/form", "https://user:password@epay.esewa.com.np/form", "https://epay.esewa.com.np:9443/form", "https://epay.esewa.com.np/form?redirect=other", "https://epay.esewa.com.np.attacker.example/form"]) {
    assert.throws(() => readEsewaCheckoutConfig({ ...base, ESEWA_PAYMENT_URL: url }));
  }
});
test("provider amounts accept exact decimals and valid grouping only", () => {
  assert.equal(parseEsewaAmount("1,000.01"), 1000.01);
  assert.equal(parseEsewaAmount(960), 960);
  for (const value of ["NaN", "Infinity", "9.6e2", "9,60", "960.001", "", null, true, {}, -1, 960.001]) {
    assert.throws(() => parseEsewaAmount(value));
  }
});
test("versioned staging example configures the sandbox and HTTPS return app", () => {
  const env = dotenv.parse(fs.readFileSync(path.resolve(__dirname, "../../../deploy/staging/.env.example")));
  assert.equal(env.NODE_ENV, "production");
  assert.equal(env.DEPLOYMENT_ENV, "staging");
  assert.equal(readEsewaCheckoutConfig(env).paymentEnvironment, "sandbox");
  assert.equal(new URL(readVerificationConfig(env).baseUrl).hostname, "rc.esewa.com.np");
});
