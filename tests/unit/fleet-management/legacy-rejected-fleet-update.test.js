"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createFleetUpdateService } = require("../../../src/modules/fleet-management/fleet-update.service");

test("legacy overall-rejected fleet without granular decisions remains editable", async () => {
  let persisted;
  const Bus = {
    findByIdAndUpdate(id, update) {
      persisted = update;
      return { lean: async () => ({ _id: id, ...update }) };
    },
  };
  const service = createFleetUpdateService({
    Bus,
    BusAmenities: { countDocuments: async () => 0 },
    repository: { findDocument: async () => ({
      _id: "f", approvalStatus: "REJECTED",
      documentReviews: { insurance: { status: "pending" } },
    }) },
    policy: {
      restrictOwnerUpdate() {}, lockApprovedIdentity() {}, validateIdentityUpdate() {},
      async normalizeBusNumber() {}, async verifySeatLayout() {}, parseCatalogAndReviews() {},
    },
    storage: { replaceFleetImages: async () => null },
    mapper: { withPresignedUrls: async (fleet) => fleet },
  });
  await service.updateFleetDetails("f", { busName: "Corrected" }, {}, "owner");
  assert.equal(persisted.busName, "Corrected");
  assert.equal(persisted["sectionReviews.vehicleDetails"].status, "not_submitted");
});
