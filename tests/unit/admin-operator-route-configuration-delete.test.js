"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Schedule = require("../../models/scheduleModel.js");
const Config = require("../../models/operatorRouteConfigModel.js");
const service = require(
  "../../src/modules/admin/operator-route-configuration/config-lifecycle.service.js"
);

function patch(t, object, key, value) {
  const original = object[key];
  object[key] = value;
  t.after(() => { object[key] = original; });
}

function populated(value) {
  return { async populate() { return value; } };
}

test("delete blocks every schedule reference", async (t) => {
  patch(t, Config, "findById", () => populated({
    _id: "c1", variantId: {},
  }));
  patch(t, Schedule, "countDocuments", async () => 4);
  await assert.rejects(
    service.deleteConfig("c1"),
    (error) => error.statusCode === 409 &&
      /Cannot delete: 4 schedule\(s\)/.test(error.message)
  );
});

test("deleting a default promotes a sibling and cleans safe return config",
  async (t) => {
    const calls = [];
    const config = {
      _id: "c1", brandId: "b1", patternName: "Express", isDefault: true,
      variantId: { _id: "v1", returnVariantId: "v2" },
      async deleteOne() { calls.push("delete-primary"); },
    };
    const sibling = {
      isDefault: false,
      async save() { calls.push("promote-sibling"); },
    };
    const returnConfig = {
      _id: "return-config",
      async deleteOne() { calls.push("delete-return"); },
    };
    let findOneCall = 0;
    patch(t, Config, "findById", () => populated(config));
    patch(t, Schedule, "countDocuments", async () => 0);
    patch(t, Config, "findOne", async () => {
      findOneCall += 1;
      return findOneCall === 1 ? sibling : returnConfig;
    });

    await service.deleteConfig("c1");
    assert.equal(sibling.isDefault, true);
    assert.deepEqual(calls, [
      "promote-sibling", "delete-return", "delete-primary",
    ]);
  });
