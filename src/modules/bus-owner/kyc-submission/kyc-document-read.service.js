"use strict";

function createKycDocumentReadService({ getPresignedUrl }) {
  async function resolveReference(ref) {
    if (ref === null || ref === undefined) return null;
    if (typeof ref !== "string") return ref;

    const trimmed = ref.trim();
    if (trimmed === "") return trimmed;

    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      return {
        storageReference: trimmed,
        viewUrl: trimmed,
        expiresInSeconds: null,
        legacy: true,
      };
    }

    const viewUrl = await getPresignedUrl(trimmed);
    return {
      storageReference: trimmed,
      viewUrl: viewUrl || trimmed,
      expiresInSeconds: 3600,
      legacy: false,
    };
  }

  async function resolveDocumentSection(section) {
    if (!section || typeof section !== "object") return section;
    const cloned = { ...section };

    if (Array.isArray(cloned.documentUrls)) {
      const refs = await Promise.all(cloned.documentUrls.map(resolveReference));
      const validRefs = refs.filter(Boolean);
      cloned.documentUrls = validRefs.map((r) => (typeof r === "object" ? r.viewUrl : r));
      cloned.documentReferences = validRefs;
    }

    return cloned;
  }

  async function resolveOwnerKycDocuments(busOwner) {
    if (!busOwner || typeof busOwner !== "object") return busOwner;

    const cloned = JSON.parse(JSON.stringify(busOwner));
    const singleDocFields = ["companyRegistration", "taxRegistration", "transportLicense"];

    for (const field of singleDocFields) {
      if (cloned[field]) {
        cloned[field] = await resolveDocumentSection(cloned[field]);
      }
    }

    if (Array.isArray(cloned.insuranceCertificates)) {
      cloned.insuranceCertificates = await Promise.all(
        cloned.insuranceCertificates.map(resolveDocumentSection)
      );
    }

    return cloned;
  }

  return { resolveReference, resolveOwnerKycDocuments };
}

module.exports = { createKycDocumentReadService };
