const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { buildStopIdentity } = require("../../src/modules/admin/platform-registry/stop-identity");
const mongoose = require("mongoose");

describe("Stop Identity Builder", () => {
  it("should normalize and concatenate name, district, municipality, and parent", () => {
    const id = new mongoose.Types.ObjectId();
    const identity = buildStopIdentity({
      name: "  Kathmandu  ",
      district: "Kathmandu Valley ",
      municipality: " KTM Metro ",
      parentStopId: id
    });
    
    assert.equal(identity, `kathmandu:kathmandu valley:ktm metro:${id.toString()}`);
  });

  it("should handle missing optional fields as empty strings", () => {
    const identity = buildStopIdentity({
      name: "Pokhara"
    });
    assert.equal(identity, "pokhara:::");
  });

  it("should throw an error if name is missing or empty", () => {
    assert.throws(() => {
      buildStopIdentity({ name: "   " });
    }, /Stop name is required/);
  });
});
