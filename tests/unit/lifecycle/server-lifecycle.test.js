"use strict";

/**
 * tests/unit/lifecycle/server-lifecycle.test.js
 * Unit tests for DB connection guard and graceful shutdown lifecycle.
 * All external dependencies (mongoose, process.exit, logger) are injected as stubs.
 */

const { describe, it, before, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");

function makeMongooseStub(opts = {}) {
  const emitter = new EventEmitter();
  emitter.readyState = 1;
  emitter.close = async () => {
    if (opts.closeError) throw opts.closeError;
  };
  return {
    connect: opts.connectError ? async () => { throw opts.connectError; } : async () => {},
    connection: emitter,
  };
}

function makeServerStub(opts = {}) {
  const emitter = new EventEmitter();
  emitter.close = (cb) => { if (cb) cb(opts.closeError || null); };
  emitter.listen = () => {};
  return emitter;
}

function makeLoggerStub() {
  return { info: () => {}, error: () => {}, warn: () => {} };
}

describe("databaseConnection", () => {
  let originalUrl;
  beforeEach(() => { originalUrl = process.env.MONGODB_URL; });
  afterEach(() => {
    if (originalUrl === undefined) delete process.env.MONGODB_URL;
    else process.env.MONGODB_URL = originalUrl;
  });

  it("throws when MONGODB_URL is not set", async () => {
    delete process.env.MONGODB_URL;
    delete require.cache[require.resolve("../../../db/db.js")];
    const databaseConnection = require("../../../db/db.js");
    await assert.rejects(() => databaseConnection(), /MONGODB_URL environment variable is not set/);
  });

  it("propagates mongoose.connect rejection", async () => {
    process.env.MONGODB_URL = "mongodb://invalid:27017/test?serverSelectionTimeoutMS=2000";
    delete require.cache[require.resolve("../../../db/db.js")];
    const original = require("mongoose");
    const originalConnect = original.connect;
    original.connect = async () => { throw new Error("simulated connect failure"); };
    try {
      const databaseConnection = require("../../../db/db.js");
      await assert.rejects(() => databaseConnection(), /simulated connect failure/);
    } finally {
      original.connect = originalConnect;
      delete require.cache[require.resolve("../../../db/db.js")];
    }
  });
});

describe("registerShutdown", () => {
  let lifecycle;
  before(() => {
    delete require.cache[require.resolve("../../../utils/lifecycle.js")];
    lifecycle = require("../../../utils/lifecycle.js");
  });

  it("closes server and mongoose on SIGTERM, calls exit(0)", async () => {
    const exitCalls = [];
    const mongoose = makeMongooseStub();
    const { deregister } = lifecycle.registerShutdown(makeServerStub(), {
      mongoose,
      exit: (code) => exitCalls.push(code),
      logger: makeLoggerStub(),
    });
    process.emit("SIGTERM");
    await new Promise((r) => setTimeout(r, 50));
    deregister();
    assert.deepEqual(exitCalls, [0]);
  });

  it("handles promise-based Mongoose close rejection without hanging", async () => {
    const exitCalls = [];
    const { deregister } = lifecycle.registerShutdown(makeServerStub(), {
      mongoose: makeMongooseStub({ closeError: new Error("close failed") }),
      exit: (code) => exitCalls.push(code),
      logger: makeLoggerStub(),
    });
    process.emit("SIGTERM");
    await new Promise((r) => setTimeout(r, 50));
    deregister();
    assert.deepEqual(exitCalls, [0]);
  });

  it("does not execute shutdown twice on duplicate signal", async () => {
    const exitCalls = [];
    const { deregister } = lifecycle.registerShutdown(makeServerStub(), {
      mongoose: makeMongooseStub(),
      exit: (code) => exitCalls.push(code),
      logger: makeLoggerStub(),
    });
    process.emit("SIGTERM");
    process.emit("SIGTERM");
    await new Promise((r) => setTimeout(r, 50));
    deregister();
    assert.equal(exitCalls.length, 1);
  });

  it("deregister() removes signal listeners cleanly", () => {
    const before = process.listenerCount("SIGTERM");
    const { deregister } = lifecycle.registerShutdown(makeServerStub(), {
      mongoose: makeMongooseStub(),
      exit: () => {},
      logger: makeLoggerStub(),
    });
    const after = process.listenerCount("SIGTERM");
    deregister();
    assert.equal(after, before + 1);
    assert.equal(process.listenerCount("SIGTERM"), before);
  });
});
