"use strict";

const {
  API_CONTRACT_VERSION,
  getPublicStatusMetadata,
} = require("../../contracts");

function createContractMetadataController() {
  return {
    async getStatuses(_req, res) {
      res.setHeader("X-API-Contract-Version", API_CONTRACT_VERSION);
      return res.status(200).json({
        success: true,
        contractVersion: API_CONTRACT_VERSION,
        data: getPublicStatusMetadata(),
      });
    },
  };
}

module.exports = {
  createContractMetadataController,
  defaultController: createContractMetadataController(),
};
