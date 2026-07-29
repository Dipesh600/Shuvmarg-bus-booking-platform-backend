"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const service = require(
  "../../src/modules/admin/platform-registry/stop-registry.service.js"
);
const controller = require(
  "../../src/modules/admin/platform-registry/stop-registry.controller.js"
);

function response() {
  let status;
  let body;
  return {
    status(code) { status = code; return this; },
    json(payload) { body = payload; return this; },
    result() { return { status, body }; },
  };
}

test("missing stop update preserves the legacy 200/null contract", async (t) => {
  const original = service.updateStop;
  t.after(() => { service.updateStop = original; });
  service.updateStop = async () => null;
  const res = response();
  await controller.updateStop({ params: { id: "missing" }, body: {} }, res);
  assert.deepEqual(res.result(), {
    status: 200,
    body: { success: true, message: "Stop updated.", data: null },
  });
});

test("referenced stop deletion preserves conflict metadata", async (t) => {
  const original = service.deleteStop;
  t.after(() => { service.deleteStop = original; });
  service.deleteStop = async () => {
    throw new Error(
      "REFERENCED:3:Stop is actively used by 3 operator route(s). " +
      "Remove it from those operators' fleets first."
    );
  };
  const res = response();
  await controller.deleteStop({ params: { id: "used" } }, res);
  assert.deepEqual(res.result(), {
    status: 409,
    body: {
      success: false,
      message: "Stop is actively used by 3 operator route(s). Remove it from " +
        "those operators' fleets first.",
      refCount: 3,
    },
  });
});
