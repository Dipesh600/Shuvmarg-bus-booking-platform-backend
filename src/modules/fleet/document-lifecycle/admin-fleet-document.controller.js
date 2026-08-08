"use strict";

const { mapErrorToResponse } = require("./fleet-document-error.mapper");

function createAdminFleetDocumentController({ uploadService, readService }) {
  async function uploadDocument(req, res) {
    try {
      const fleetId = req.params.fleetId || req.params.id;
      const slot = req.params.slot || req.body.docSlot;
      const result = await uploadService.uploadDocument({
        fleetId,
        slot,
        body: req.body,
        files: req.files,
        actorContext: { adminInfo: req.adminInfo },
      });
      return res.status(200).json(result);
    } catch (error) {
      return mapErrorToResponse(error, res);
    }
  }

  async function getDocumentReadUrl(req, res) {
    try {
      const fleetId = req.params.fleetId || req.params.id;
      const slot = req.params.slot;
      const imageId = req.query.imageId;
      const result = await readService.getDocumentReadUrl({
        fleetId,
        slot,
        imageId,
        actorContext: { adminInfo: req.adminInfo },
      });
      return res.status(200).json(result);
    } catch (error) {
      return mapErrorToResponse(error, res);
    }
  }

  return {
    uploadDocument,
    getDocumentReadUrl,
  };
}

module.exports = createAdminFleetDocumentController;
