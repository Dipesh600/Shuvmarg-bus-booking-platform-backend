"use strict";

process.env.SECRET_KEY ||= "test-only-secret-32chars-minimum!!";

const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const service = require("../../../src/modules/bus-owner/auth/login/bus-owner-login.service");
const repository = require("../../../src/modules/bus-owner/auth/login/bus-owner-login.repository");

test("expired one-time password requires an admin resend and never signs a token", async () => {
  const originalFind = repository.findLoginUser;
  const originalCompare = bcrypt.compare;
  const originalSign = jwt.sign;
  let signed = false;
  repository.findLoginUser = async () => ({
    _id: "u1",
    phone: "9814500001",
    password: "hash",
    role: "busOwner",
    roles: ["busOwner"],
    status: "active",
    forcePasswordChange: true,
    temporaryCredentialExpiresAt: new Date(Date.now() - 1000),
  });
  bcrypt.compare = async () => true;
  jwt.sign = () => { signed = true; return "temp"; };
  try {
    await assert.rejects(
      () => service.login({ rawPhone: "p", password: "pw" }),
      (error) => error.statusCode === 410
        && error.responseBody.errorCode === "TEMPORARY_CREDENTIAL_EXPIRED"
    );
    assert.equal(signed, false);
  } finally {
    repository.findLoginUser = originalFind;
    bcrypt.compare = originalCompare;
    jwt.sign = originalSign;
  }
});
