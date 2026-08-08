"use strict";

const { sanitizeFleetDocumentDescriptors } = require("../fleet/document-lifecycle/fleet-document.dto");

function createFleetDocumentMapper() {
  async function withPresignedUrls(fleet) {
    if (!fleet) return null;
    return sanitizeFleetDocumentDescriptors(fleet);
  }

  function withRawKeys(fleet) {
    if (!fleet) return null;
    return sanitizeFleetDocumentDescriptors(fleet);
  }

  return { withPresignedUrls, withRawKeys };
}

module.exports = { createFleetDocumentMapper };
