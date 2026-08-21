"use strict";

const { mapErrorToResponse } = require("./fleet-document-error.mapper");
const { streamFleetDocument } = require("./fleet-document-stream-response");

function createBusOwnerFleetDocumentController({ uploadService, readService }) {
  async function uploadDocument(req, res) {
    try {
      const fleetId = req.params.fleetId;
      const slot = req.params.slot;
      const result = await uploadService.uploadDocument({
        fleetId,
        slot,
        body: req.body,
        files: req.files,
        actorContext: { userInfo: req.userInfo },
      });
      return res.status(200).json(result);
    } catch (error) {
      return mapErrorToResponse(error, res);
    }
  }

  async function getDocumentReadUrl(req, res) {
    try {
      const fleetId = req.params.fleetId;
      const slot = req.params.slot;
      const imageId = req.query.imageId;
      const result = await readService.getDocumentReadUrl({
        fleetId,
        slot,
        imageId,
        actorContext: { userInfo: req.userInfo },
      });
      return res.status(200).json(result);
    } catch (error) {
      return mapErrorToResponse(error, res);
    }
  }

  async function viewDocument(req, res) {
    try {
      const result = await readService.getDocumentObject({
        fleetId: req.params.fleetId,
        slot: req.params.slot,
        imageId: req.query.imageId,
        imageIndex: req.query.imageIndex,
        actorContext: { userInfo: req.userInfo },
      });
      return streamFleetDocument(result, res);
    } catch (error) {
      return mapErrorToResponse(error, res);
    }
  }

  return {
    uploadDocument,
    getDocumentReadUrl,
    viewDocument,
  };
}

module.exports = createBusOwnerFleetDocumentController;
