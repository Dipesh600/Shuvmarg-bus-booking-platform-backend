"use strict";

const { describe, test } = require("node:test");
const assert = require("node:assert/strict");

const {
  LEGACY_PREFIX,
  MAX_LEGACY_ATTEMPTS,
  allocateLegacyAgentId,
  applyAgentCodeHooks,
  buildLegacyAgentId,
} = require("../../../../src/shared/identity/agent-code.hooks.js");
const {
  LEGACY_AGENT_ID_PATTERN,
} = require("../../../../src/shared/identity/agent-code-lookup.js");

/** Captures what applyAgentCodeHooks installs, without pulling in mongoose. */
function fakeSchema() {
  const pres = [];
  return { pres, pre: (event, fn) => pres.push({ event, fn }) };
}

/** Runs the installed pre-save hook against a plain document. */
async function runHook(doc, options) {
  const schema = fakeSchema();
  applyAgentCodeHooks(schema, options);
  assert.equal(schema.pres.length, 1);
  assert.equal(schema.pres[0].event, "save");
  await schema.pres[0].fn.call(doc);
  return doc;
}

const STUB = {
  allocate: async () => "SM-AG-7K4QP2X",
  allocateLegacy: async () => "SHV-AG-KRM-042",
};

describe("legacy agentId generation", () => {
  test("keeps the shape existing readers and stored records depend on", () => {
    for (let index = 0; index < 500; index += 1) {
      const id = buildLegacyAgentId();
      assert.match(id, LEGACY_AGENT_ID_PATTERN, id);
      assert.ok(id.startsWith(`${LEGACY_PREFIX}-`), id);
    }
  });

  test("does not repeat itself, so the source is not a constant or single seed", () => {
    const seen = new Set();
    for (let index = 0; index < 500; index += 1) {
      seen.add(buildLegacyAgentId());
    }
    // 500 draws from 46,656,000 -> ~0.003 expected collisions.
    assert.ok(seen.size > 495, `only ${seen.size} distinct ids in 500 draws`);
  });

  test("skips a taken id and returns the next free one", async () => {
    const asked = [];
    const taken = new Set();
    let call = 0;
    const AgentModel = {
      exists: async ({ agentId }) => {
        asked.push(agentId);
        call += 1;
        if (call === 1) {
          taken.add(agentId);
          return { _id: "existing" };
        }
        return null;
      },
    };

    const id = await allocateLegacyAgentId(AgentModel);

    assert.equal(asked.length, 2);
    assert.equal(id, asked[1]);
    assert.equal(taken.has(id), false);
  });

  test("gives up after the cap instead of hammering the database forever", async () => {
    const asked = [];
    const AgentModel = {
      exists: async ({ agentId }) => {
        asked.push(agentId);
        return { _id: "existing" };
      },
    };

    await assert.rejects(
      () => allocateLegacyAgentId(AgentModel),
      /keyspace is effectively exhausted/
    );
    assert.equal(asked.length, MAX_LEGACY_ATTEMPTS);
  });
});

describe("agent identifier hooks", () => {
  test("fills both identifiers on a fresh agent", async () => {
    const doc = await runHook({}, STUB);
    assert.equal(doc.code, "SM-AG-7K4QP2X");
    assert.equal(doc.agentId, "SHV-AG-KRM-042");
  });

  test("never re-mints a code an agent already carries", async () => {
    // Codes are published, so re-minting would strand whoever wrote one down.
    const doc = await runHook(
      { code: "SM-AG-AAAAAAA", agentId: "SHV-AG-XYZ-001" },
      {
        allocate: async () => assert.fail("re-minted an existing code"),
        allocateLegacy: async () => assert.fail("re-minted an existing agentId"),
      }
    );
    assert.equal(doc.code, "SM-AG-AAAAAAA");
    assert.equal(doc.agentId, "SHV-AG-XYZ-001");
  });

  test("backfills only the missing one for a legacy agent being re-saved", async () => {
    const doc = await runHook({ agentId: "SHV-AG-XYZ-001" }, {
      ...STUB,
      allocateLegacy: async () => assert.fail("overwrote a legacy agentId"),
    });
    assert.equal(doc.code, "SM-AG-7K4QP2X");
    assert.equal(doc.agentId, "SHV-AG-XYZ-001");
  });

  test("passes the model through so allocation queries the right collection", async () => {
    const doc = { constructor: { marker: "AgentModel" } };
    let seen = null;
    await runHook(doc, {
      allocate: async ({ AgentModel }) => {
        seen = AgentModel;
        return "SM-AG-7K4QP2X";
      },
      allocateLegacy: async () => "SHV-AG-KRM-042",
    });
    assert.equal(seen, doc.constructor);
  });

  test("lets an allocation failure reject the save rather than saving a blank code", async () => {
    await assert.rejects(
      () => runHook({}, { ...STUB, allocate: async () => { throw new Error("boom"); } }),
      /boom/
    );
  });
});
