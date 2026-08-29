"use strict";

const { describe, test } = require("node:test");
const assert = require("node:assert/strict");

const { ENTITY_TYPE_CODES } = require("../../../../src/shared/identity/entity-type-codes.js");
const { isValidEntityCode } = require("../../../../src/shared/identity/entity-code.js");
const {
  MAX_ALLOCATION_ATTEMPTS,
  allocateAgentCode,
} = require("../../../../src/shared/identity/agent-code-allocation.service.js");

/** A model stub reporting the given codes as already taken. */
function modelWithTaken(taken) {
  const asked = [];
  return {
    asked,
    exists: async ({ code }) => {
      asked.push(code);
      return taken.has(code) ? { _id: "existing" } : null;
    },
  };
}

describe("agent code allocation", () => {
  test("mints a valid agent code and asks the database once when it is free", async () => {
    const AgentModel = modelWithTaken(new Set());

    const code = await allocateAgentCode({ AgentModel });

    assert.equal(isValidEntityCode(code, ENTITY_TYPE_CODES.AGENT), true, code);
    assert.deepEqual(AgentModel.asked, [code], "queried something other than the candidate");
  });

  test("always asks for the AGENT type, never another entity's", async () => {
    const requested = [];
    await allocateAgentCode({
      AgentModel: modelWithTaken(new Set()),
      generate: (typeCode) => {
        requested.push(typeCode);
        return "SM-AG-7K4QP2X";
      },
    });
    assert.deepEqual(requested, [ENTITY_TYPE_CODES.AGENT]);
  });

  test("skips a code that is already taken and returns the next free one", async () => {
    const first = "SM-AG-AAAAAAA";
    const second = "SM-AG-BBBBBBB";
    const AgentModel = modelWithTaken(new Set([first]));
    const queue = [first, second];

    const code = await allocateAgentCode({
      AgentModel,
      generate: () => queue.shift(),
    });

    assert.equal(code, second);
    assert.deepEqual(AgentModel.asked, [first, second]);
  });

  test("gives up after the cap instead of looping forever", async () => {
    // The loop this replaces was unbounded, which turns an exhausted keyspace
    // into an outage rather than a failed request.
    const stuck = "SM-AG-7K4QP2X";
    const AgentModel = modelWithTaken(new Set([stuck]));

    await assert.rejects(
      () => allocateAgentCode({ AgentModel, generate: () => stuck }),
      /Could not allocate a unique agent code/
    );
    assert.equal(AgentModel.asked.length, MAX_ALLOCATION_ATTEMPTS);
  });

  test("does not repeat itself across allocations", async () => {
    const AgentModel = modelWithTaken(new Set());
    const seen = new Set();
    for (let index = 0; index < 200; index += 1) {
      seen.add(await allocateAgentCode({ AgentModel }));
    }
    assert.equal(seen.size, 200);
  });
});
