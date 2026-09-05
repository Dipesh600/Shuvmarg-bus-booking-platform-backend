"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { mapBusOwnerFleetListItem } = require("../../src/modules/read-contracts/fleet/bus-owner-fleet-list.dto.js");

test("fleet list exposes brandId required by post-approval route setup", () => {
  const item = mapBusOwnerFleetListItem({
    _id: "507f1f77bcf86cd799439011",
    brandId: "507f1f77bcf86cd799439020",
    busName: "Night Express",
    busNumber: "BA 1 KHA 1000",
    approvalStatus: "APPROVED",
  });

  assert.equal(item.brandId, "507f1f77bcf86cd799439020");
});
