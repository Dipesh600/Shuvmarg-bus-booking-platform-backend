"use strict";

const requestPolicy = require("./fleet-document-request.policy");
const errors = require("./fleet-document.errors");
const dto = require("./fleet-document.dto");

function isAllowlistedLegacyUrl(url) {
  if (typeof url !== "string" || !url) return false;
  if (url.includes("..") || url.includes("\\")) return false;
  const bucketName = process.env.AWS_S3_BUCKET_NAME || "";
  if (url.startsWith("http://") || url.startsWith("https://")) {
    try {
      const parsed = new URL(url);
      if (bucketName && !parsed.hostname.includes(bucketName) && !parsed.pathname.includes(bucketName)) {
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }
  return true; // S3 path segment string
}

function createFleetDocumentReadService(deps = {}) {
  const repository = deps.repository;
  const getPresignedUrl = deps.getPresignedUrl;
  const resolveActor = deps.resolveActor;
  const ttlSeconds = deps.ttlSeconds || 60;

  async function getDocumentReadUrl({ fleetId, slot, imageId, actorContext }) {
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
        targetKey = images[0]?.objectKey || (typeof images[0] === "string" ? images[0] : null);
      }
    } else {
      const doc = fleet.fleetDocuments?.[slot];
      targetKey = doc?.objectKey || doc?.url || null;
    }

    if (!targetKey) {
      throw errors.notFound(`No document uploaded for slot '${slot}'.`);
    }

    if (typeof targetKey === "string" && (targetKey.startsWith("http://") || targetKey.startsWith("https://"))) {
      if (!isAllowlistedLegacyUrl(targetKey)) {
        throw errors.notFound("Legacy document URL is invalid or not allowed.");
      }
    }

    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    const readUrl = await getPresignedUrl(targetKey, ttlSeconds);

    return dto.buildReadResponse({
      fleetId,
      slot,
      readUrl,
      expiresAt,
    });
  }

  return { getDocumentReadUrl };
}

module.exports = createFleetDocumentReadService;
