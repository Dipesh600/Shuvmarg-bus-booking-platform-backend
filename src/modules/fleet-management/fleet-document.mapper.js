"use strict";

function createFleetDocumentMapper({ getPresignedUrl }) {
  async function withPresignedUrls(fleet) {
    if (!fleet) return null;
    if (fleet.fleetImages?.length > 0) {
      fleet.fleetImages = await Promise.all(
        fleet.fleetImages.map((key) => getPresignedUrl(key))
      );
    }
    const documents = fleet.fleetDocuments;
    for (const slot of [
      "fitnessCert", "insurance", "bluebook", "routePermit",
    ]) {
      if (documents?.[slot]?.url) {
        documents[slot].url = await getPresignedUrl(documents[slot].url);
      }
    }
    return fleet;
  }

  const withRawKeys = (fleet) => fleet;

  return { withPresignedUrls, withRawKeys };
}

module.exports = { createFleetDocumentMapper };
