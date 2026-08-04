"use strict";

const { KycDocumentReadError } = require("./kyc-document-read.errors");

const MAX_URL_TTL_SECONDS = 300;

function resolveReadTtlSeconds() {
  const envTtl = parseInt(process.env.KYC_DOCUMENT_READ_URL_TTL_SECONDS, 10);
  if (!envTtl || isNaN(envTtl) || envTtl <= 0) {
    return MAX_URL_TTL_SECONDS;
  }
  return Math.min(envTtl, MAX_URL_TTL_SECONDS);
}

function createKycDocumentReadUrlService({ getPresignedUrl }) {
  async function generateReadUrl({ actor, storageReference, clock = () => new Date() }) {
    if (!storageReference || typeof storageReference !== "string") {
      throw new KycDocumentReadError("KYC_DOCUMENT_READ_INVALID_REQUEST", "Storage reference is required.", 400);
    }

    const trimmed = storageReference.trim();
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      if (actor && actor.type === "ADMIN") {
        return {
          downloadUrl: trimmed,
          expiresAt: null,
          legacy: true,
        };
      }
      throw new KycDocumentReadError(
        "KYC_DOCUMENT_UNSUPPORTED_LEGACY",
        "Legacy HTTP document URLs cannot be accessed by bus owners directly.",
        422
      );
    }

    const ttlSeconds = resolveReadTtlSeconds();
    const downloadUrl = await getPresignedUrl(trimmed, ttlSeconds);

    if (!downloadUrl) {
      throw new KycDocumentReadError("KYC_DOCUMENT_READ_NOT_FOUND", "Failed to generate presigned URL.", 404);
    }

    const expiresAt = new Date(clock().getTime() + ttlSeconds * 1000).toISOString();

    return {
      downloadUrl,
      expiresAt,
    };
  }

  return { generateReadUrl, resolveReadTtlSeconds };
}

module.exports = {
  MAX_URL_TTL_SECONDS,
  resolveReadTtlSeconds,
  createKycDocumentReadUrlService,
};
