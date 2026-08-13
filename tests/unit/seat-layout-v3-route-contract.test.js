"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { registerAdminSeatLayoutV3Routes } = require("../../routes/adminRoutes/seatLayoutV3Routes");
const {
  registerBusOwnerSeatLayoutV3Routes,
  registerBusOwnerSeatLayoutV3OperationalRoutes,
} = require("../../routes/busOwner/seatLayoutV3Routes");

function recorder() {
  const calls = [];
  return {
    calls,
    router: {
      get: (path, ...handlers) => calls.push(["get", path, handlers]),
      post: (path, ...handlers) => calls.push(["post", path, handlers]),
      patch: (path, ...handlers) => calls.push(["patch", path, handlers]),
    },
  };
}

function controller(methods) {
  return Object.fromEntries(methods.map((name) => [name, function handler() {}]));
}

test("admin V3 routes are authenticated and expose lifecycle actions", () => {
  const methods = [
    "listTemplates", "createPlatformTemplate", "getTemplate", "adoptForOperator",
    "createRevision", "submitRevision", "publishRevision", "getFleetAssignment",
    "assignInitial", "listChangeRequests", "approveChange", "rejectChange",
  ];
  const value = recorder();
  const auth = function auth() {};
  const handlers = controller(methods);
  registerAdminSeatLayoutV3Routes(value.router, auth, handlers);
  assert.equal(value.calls.length, methods.length);
  assert.ok(value.calls.every(([, path, stack]) => path.startsWith("/seat-layout-v3/") && stack[0] === auth));
  assert.deepEqual(value.calls.map(([method, path]) => `${method} ${path}`), [
    "get /seat-layout-v3/templates", "post /seat-layout-v3/templates",
    "get /seat-layout-v3/templates/:templateId", "post /seat-layout-v3/templates/:templateId/adopt",
    "post /seat-layout-v3/templates/:templateId/revisions",
    "post /seat-layout-v3/templates/:templateId/revisions/:revisionId/submit",
    "post /seat-layout-v3/templates/:templateId/revisions/:revisionId/publish",
    "get /seat-layout-v3/fleets/:fleetId/assignment", "post /seat-layout-v3/fleets/:fleetId/assignment",
    "get /seat-layout-v3/change-requests", "post /seat-layout-v3/change-requests/:requestId/approve",
    "post /seat-layout-v3/change-requests/:requestId/reject",
  ]);
});

test("owner V3 operational routes expose trip pricing and guarded place controls", () => {
  const value = recorder();
  const handlers = controller(["get", "changePlaceState", "changePricing"]);
  registerBusOwnerSeatLayoutV3OperationalRoutes(value.router, handlers);
  assert.deepEqual(value.calls.map(([method, path]) => `${method} ${path}`), [
    "get /seat-layout-v3/trips/:tripId",
    "patch /seat-layout-v3/trips/:tripId/places/:elementId/state",
    "patch /seat-layout-v3/trips/:tripId/pricing",
  ]);
});

test("owner V3 routes expose catalog, adoption and reviewed fleet changes", () => {
  const methods = [
    "listCatalog", "listMyTemplates", "getTemplate", "adoptPlatformTemplate",
    "createRevision", "submitRevision", "getFleetAssignment", "assignInitial", "createInitialCustomLayout", "requestChange",
  ];
  const value = recorder();
  const handlers = controller(methods);
  registerBusOwnerSeatLayoutV3Routes(value.router, handlers);
  assert.equal(value.calls.length, methods.length);
  assert.ok(value.calls.every(([, path, stack]) => path.startsWith("/seat-layout-v3/") && stack.length >= 1));
  assert.ok(value.calls.filter(([method]) => method === "post").some(([, , stack]) => stack.length === 3));
  assert.ok(value.calls.some(([method, path]) => method === "post" && path.endsWith("/change-requests")));
});
