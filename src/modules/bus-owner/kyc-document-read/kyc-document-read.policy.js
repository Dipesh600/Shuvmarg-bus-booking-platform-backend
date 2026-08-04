"use strict";

const { KycDocumentReadError } = require("./kyc-document-read.errors");

function assertCanReadBusOwnerKycDocument({ actor, busOwner, logger = console }) {
  if (!actor || !actor.type || !actor.userId) {
    throw new KycDocumentReadError(
      "KYC_DOCUMENT_READ_UNAUTHORIZED",
      "Authentication required to read KYC document.",
      401
    );
  }

  if (!busOwner || typeof busOwner !== "object") {
    throw new KycDocumentReadError(
      "KYC_DOCUMENT_READ_NOT_FOUND",
      "Bus owner KYC record not found.",
      404
    );
  }

  if (actor.type === "ADMIN") {
    return true;
  }

  if (actor.type === "BUS_OWNER") {
    const ownerUserId = String(busOwner.user?._id || busOwner.user);
    if (ownerUserId === String(actor.userId)) {
      return true;
    }
  }

  if (logger && typeof logger.warn === "function") {
    logger.warn("KYC_DOCUMENT_READ_DENIED", {
      event: "KYC_DOCUMENT_READ_DENIED",
      actorId: actor.userId,
      actorType: actor.type,
      busOwnerId: String(busOwner._id || busOwner.id),
    });
  }

  throw new KycDocumentReadError(
    "KYC_DOCUMENT_READ_FORBIDDEN",
    "Access denied to the requested KYC document.",
    403
  );
}

module.exports = { assertCanReadBusOwnerKycDocument };
