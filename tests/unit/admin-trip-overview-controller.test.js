"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const moduleRoot = "../../src/modules/admin/trip-overview/";
const controllerPath = require.resolve(
  `${moduleRoot}trip-overview.controller.js`
);
const dependencies = [
  ["exception-overview.service.js", "getOverview"],
  ["schedule-health.service.js", "getScheduleHealth"],
  ["trip-search.service.js", "searchTrips"],
  ["route-performance.service.js", "getRoutePerformance"],
];

const response = () => {
  let status;
  let body;
  return {
    status(code) {
      status = code;
      return this;
    },
    json(value) {
      body = value;
      return this;
    },
    result: () => ({ status, body }),
  };
};

const loadController = (implementations) => {
  const saved = new Map();
  dependencies.forEach(([file, operation], index) => {
    const resolved = require.resolve(`${moduleRoot}${file}`);
    saved.set(resolved, require.cache[resolved]);
    require.cache[resolved] = {
      id: resolved,
      filename: resolved,
      loaded: true,
      exports: { [operation]: implementations[index] },
    };
  });
  saved.set(controllerPath, require.cache[controllerPath]);
  delete require.cache[controllerPath];
  const controller = require(controllerPath);
  return {
    controller,
    restore() {
      for (const [resolved, cached] of saved) {
        if (cached) require.cache[resolved] = cached;
        else delete require.cache[resolved];
      }
    },
  };
};

test("admin trip-overview controller contracts", async (t) => {
  await t.test("all handlers return the service data unchanged", async () => {
    const inputs = [];
    const harness = loadController(
      dependencies.map((_, index) => async (query) => {
        inputs.push(query);
        return { operation: index };
      })
    );
    try {
      const handlers = dependencies.map(
        ([, operation]) => harness.controller[operation]
      );
      for (let index = 0; index < handlers.length; index += 1) {
        const res = response();
        await handlers[index]({ query: { index } }, res);
        assert.deepEqual(res.result(), {
          status: 200,
          body: { success: true, data: { operation: index } },
        });
      }
      assert.deepEqual(inputs, [
        { index: 0 },
        { index: 1 },
        { index: 2 },
        { index: 3 },
      ]);
    } finally {
      harness.restore();
    }
  });

  await t.test("invalid overview date remains an exact 400", async () => {
    const failure = async () => {
      throw new Error("Invalid date format.");
    };
    const harness = loadController([
      failure,
      async () => ({}),
      async () => ({}),
      async () => ({}),
    ]);
    try {
      const res = response();
      await harness.controller.getOverview({ query: {} }, res);
      assert.deepEqual(res.result(), {
        status: 400,
        body: { success: false, message: "Invalid date format." },
      });
    } finally {
      harness.restore();
    }
  });

  await t.test("other dependency failures remain exact 500 responses", async () => {
    const failure = async () => {
      throw new Error("database unavailable");
    };
    const harness = loadController([
      async () => ({}),
      failure,
      failure,
      failure,
    ]);
    try {
      for (const operation of [
        "getScheduleHealth",
        "searchTrips",
        "getRoutePerformance",
      ]) {
        const res = response();
        await harness.controller[operation]({ query: {} }, res);
        assert.deepEqual(res.result(), {
          status: 500,
          body: { success: false, message: "database unavailable" },
        });
      }
    } finally {
      harness.restore();
    }
  });
});
