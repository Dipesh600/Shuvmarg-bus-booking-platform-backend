const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const optionalAuth = require("../../../middleware/optionalAuthMiddleware");

const run = (authorization) => {
  const req = { headers: {} };
  if (authorization !== undefined) req.headers.authorization = authorization;

  let statusCode;
  let body;
  let nextCalls = 0;
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(payload) {
      body = payload;
      return this;
    },
  };

  optionalAuth(req, res, () => {
    nextCalls += 1;
  });

  return { req, statusCode, body, nextCalls };
};

test("optional access-token authentication", async (t) => {
  const originalSecret = process.env.SECRET_KEY;

  t.before(() => {
    process.env.SECRET_KEY = "optional-auth-test-secret";
  });

  t.after(() => {
    if (originalSecret === undefined) delete process.env.SECRET_KEY;
    else process.env.SECRET_KEY = originalSecret;
  });

  await t.test("allows an anonymous request without creating identity", () => {
    const result = run();
    assert.equal(result.nextCalls, 1);
    assert.equal(result.req.userInfo, undefined);
    assert.equal(result.statusCode, undefined);
  });

  await t.test("attaches a valid access-token identity", () => {
    const token = jwt.sign(
      { id: "passenger-1", role: "passenger", purpose: "access" },
      process.env.SECRET_KEY
    );
    const result = run(`Bearer ${token}`);

    assert.equal(result.nextCalls, 1);
    assert.equal(result.req.userInfo.id, "passenger-1");
    assert.equal(result.req.userInfo.activeRole, "passenger");
    assert.deepEqual(result.req.userInfo.roles, ["passenger"]);
  });

  await t.test("ignores a malformed supplied authorization header", () => {
    const result = run("Bearer");
    assert.equal(result.nextCalls, 1);
    assert.equal(result.statusCode, undefined);
    assert.equal(result.req.userInfo, undefined);
  });

  await t.test("ignores a non-Bearer authorization scheme", () => {
    const token = jwt.sign(
      { id: "passenger-1", purpose: "access" },
      process.env.SECRET_KEY
    );
    const result = run(`Basic ${token}`);
    assert.equal(result.nextCalls, 1);
    assert.equal(result.statusCode, undefined);
    assert.equal(result.req.userInfo, undefined);
  });

  await t.test("ignores an invalid supplied token", () => {
    const result = run("Bearer invalid-token");
    assert.equal(result.nextCalls, 1);
    assert.equal(result.statusCode, undefined);
    assert.equal(result.req.userInfo, undefined);
  });

  await t.test("ignores an expired supplied token", () => {
    const token = jwt.sign(
      { id: "passenger-1", purpose: "access", exp: 1 },
      process.env.SECRET_KEY
    );
    const result = run(`Bearer ${token}`);
    assert.equal(result.nextCalls, 1);
    assert.equal(result.statusCode, undefined);
    assert.equal(result.req.userInfo, undefined);
  });

  await t.test("ignores a token with the wrong purpose", () => {
    const token = jwt.sign(
      { id: "passenger-1", purpose: "FORCE_PASSWORD_CHANGE" },
      process.env.SECRET_KEY
    );
    const result = run(`Bearer ${token}`);
    assert.equal(result.nextCalls, 1);
    assert.equal(result.statusCode, undefined);
    assert.equal(result.req.userInfo, undefined);
  });
});
