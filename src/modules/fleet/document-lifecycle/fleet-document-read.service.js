"use strict";

const requestPolicy = require("./fleet-document-request.policy");
const errors = require("./fleet-document.errors");
const dto = require("./fleet-document.dto");

function createFleetDocumentReadService(deps = {}) {
  const repository = deps.repository;
  const getPresignedUrl = deps.getPresignedUrl;
  const fetchDocument = deps.fetchDocument;
  const resolveActor = deps.resolveActor;
  const ttlSeconds = deps.ttlSeconds || 60;

  function parseImageIndex(value) {
    if (value === undefined || value === null || value === "") return 0;
    if (!/^\d+$/.test(String(value))) {
      throw errors.invalidMetadata("imageIndex must be a non-negative integer.");
    }
    return Number(value);
  }

  async function resolveDocumentReference({ fleetId, slot, imageId, imageIndex, actorContext }) {
    requestPolicy.validateFleetId(fleetId);
    requestPolicy.validateSlot(slot);

    const actor = await resolveActor(actorContext, repository);
    const fleet = await repository.findFleetForRead(fleetId);
    if (!fleet) throw errors.notFound();

    if (actor.actorType === "BUS_OWNER") {
      if (fleet.ownerId.toString() !== actor.userId) {
        throw errors.forbidden("Fleet does not belong to the authenticated owner.");
      }
    }

    let targetKey = null;

    if (slot === "fleetImages") {
      const images = fleet.fleetImages || [];
      if (!Array.isArray(images) || images.length === 0) {
        throw errors.notFound("No fleet images found.");
      }
      if (imageId) {
        const found = images.find((img) => img.imageId === imageId || img === imageId);
        targetKey = found?.objectKey || (typeof found === "string" ? found : null);
      } else {
        const index = parseImageIndex(imageIndex);
        const image = images[index];
        targetKey = image?.objectKey || (typeof image === "string" ? image : null);
      }
    } else {
      const doc = fleet.fleetDocuments?.[slot];
      targetKey = doc?.objectKey || doc?.url || null;
    }

    if (!targetKey) {
      throw errors.notFound(`No document uploaded for slot '${slot}'.`);
    }

    if (/^https?:\/\//i.test(targetKey)) {
      throw errors.legacyReference();
    }

    return { fleetId, slot, targetKey };
  }

  async function getDocumentReadUrl({ fleetId, slot, imageId, imageIndex, actorContext }) {
    const resolved = await resolveDocumentReference({ fleetId, slot, imageId, imageIndex, actorContext });

    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    const readUrl = await getPresignedUrl(resolved.targetKey, ttlSeconds);

    return dto.buildReadResponse({
      fleetId,
      slot,
      readUrl,
      expiresAt,
    });
  }

  async function getDocumentObject({ fleetId, slot, imageId, imageIndex, actorContext }) {
    if (typeof fetchDocument !== "function") {
      throw errors.storageFailure("Fleet document streaming is unavailable.");
    }
    const resolved = await resolveDocumentReference({ fleetId, slot, imageId, imageIndex, actorContext });
    if (/^https?:\/\//i.test(resolved.targetKey)) throw errors.legacyReference();
    return {
      ...resolved,
      object: await fetchDocument(resolved.targetKey),
    };
  }

  return { getDocumentReadUrl, getDocumentObject };
}

module.exports = createFleetDocumentReadService;
