'use strict';

const repository = require('./agent-application-document-upload.repository.js');
const policy = require('./agent-application-document-upload.policy.js');
const documentTypePolicy = require('./document-type.policy.js');
const storage = require('./document-storage.service.js');

const processDocumentUpload = async (userId, documentType, file) => {
    const agent = await repository.findAgentByUserId(userId);
    if (!agent) {
        return {
            success: false,
            status: 404,
            message: 'Start your application first before uploading documents.',
        };
    }

    if (!policy.isUploadableStatus(agent.applicationStatus)) {
        return {
            success: false,
            status: 400,
            message: `Cannot upload documents in "${agent.applicationStatus}" status.`,
        };
    }

    if (!documentType || !documentTypePolicy.isValidDocumentType(documentType)) {
        return {
            success: false,
            status: 400,
            message: `Invalid document type. Must be one of: ${documentTypePolicy.VALID_DOCUMENT_TYPES.join(', ')}`,
        };
    }

    if (!file) {
        return {
            success: false,
            status: 400,
            message: "No file provided. Send file in 'file' field.",
        };
    }

    const { processed, fileKey } = await storage.processAndUpload(file, agent._id, documentType);

    const existingIndex = agent.documents.findIndex((d) => d.type === documentType);

    if (existingIndex !== -1) {
        const oldKey = agent.documents[existingIndex].fileKey;
        agent.documents[existingIndex] = {
            type: documentType,
            fileKey,
            uploadedAt: new Date(),
            verified: false,
            verifiedBy: null,
            verifiedAt: null,
            rejectionReason: null,
        };
        storage.deleteOldFile(oldKey);
    } else {
        agent.documents.push({
            type: documentType,
            fileKey,
            uploadedAt: new Date(),
        });
    }

    await repository.saveAgent(agent);

    const previewUrl = await storage.getPreviewUrl(fileKey);

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
        // returned to controller for logging
        agentId: agent.agentId,
        wasCompressed: processed.wasCompressed,
        originalSize: processed.originalSize,
        compressedSize: processed.size,
    };
};

module.exports = {
    processDocumentUpload,
};
