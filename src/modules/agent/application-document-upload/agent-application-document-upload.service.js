'use strict';

const repository = require('./agent-application-document-upload.repository.js');
const policy = require('./agent-application-document-upload.policy.js');
const documentTypePolicy = require('./document-type.policy.js');
const storage = require('./document-storage.service.js');

const validateUploadRequest = (agent, documentType, file) => {
    if (!agent) {
        return { success: false, status: 404, message: 'Start your application first before uploading documents.' };
    }
    if (!policy.isUploadableStatus(agent.applicationStatus)) {
        return { success: false, status: 400, message: `Cannot upload documents in "${agent.applicationStatus}" status.` };
    }
    if (!documentType || !documentTypePolicy.isValidDocumentType(documentType)) {
        const types = documentTypePolicy.VALID_DOCUMENT_TYPES.join(', ');
        return { success: false, status: 400, message: `Invalid document type. Must be one of: ${types}` };
    }
    if (!file) {
        return { success: false, status: 400, message: "No file provided. Send file in 'file' field." };
    }
    return null;
};

const replaceOrAddDocument = (agent, documentType, fileKey, malwareScan) => {
    const security = { malwareScanStatus: malwareScan?.status || 'unknown',
        malwareScannedAt: malwareScan?.scannedAt || null, contentHash: malwareScan?.contentHashes?.[0] || null };
    const existingIndex = agent.documents.findIndex((d) => d.type === documentType);
    if (existingIndex !== -1) {
        const oldKey = agent.documents[existingIndex].fileKey;
        agent.documents[existingIndex] = {
            type: documentType, fileKey, uploadedAt: new Date(),
            ...security,
            verified: false, verifiedBy: null, verifiedAt: null, rejectionReason: null,
        };
        storage.deleteOldFile(oldKey);
    } else {
        agent.documents.push({ type: documentType, fileKey, uploadedAt: new Date(), ...security });
    }
};

const buildUploadSuccess = (agent, documentType, processed, previewUrl) => {
    return {
        success: true,
        status: 200,
        message: `${documentType} uploaded successfully.`,
        data: {
            documentType,
            previewUrl,
            wasCompressed: processed.wasCompressed,
            originalSize: processed.originalSize,
            compressedSize: processed.size,
        },
        agentId: agent.agentId,
        wasCompressed: processed.wasCompressed,
        originalSize: processed.originalSize,
        compressedSize: processed.size,
    };
};

const processDocumentUpload = async (userId, documentType, file) => {
    const agent = await repository.findAgentByUserId(userId);
    const validationError = validateUploadRequest(agent, documentType, file);
    if (validationError) return validationError;

    const { processed, fileKey, malwareScan } = await storage.processAndUpload(file, agent._id, documentType);
    replaceOrAddDocument(agent, documentType, fileKey, malwareScan);
    await repository.saveAgent(agent);

    const previewUrl = await storage.getPreviewUrl(fileKey);
    return buildUploadSuccess(agent, documentType, processed, previewUrl);
};

module.exports = {
    processDocumentUpload,
    validateUploadRequest,
    replaceOrAddDocument,
    buildUploadSuccess,
};
