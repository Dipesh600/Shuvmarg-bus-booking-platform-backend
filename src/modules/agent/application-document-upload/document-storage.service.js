'use strict';

const fileProcessor = require('../../../../services/fileProcessor.js');
const s3 = require('../../../../services/s3Service.js');
const security = require('./document-security');

const processAndUpload = async (file, agentObjectId, documentType) => {
    await security.scan(file, documentType);
    const processed = await fileProcessor.processFile(file, { preset: 'document' });
    const malwareScan = await security.scan(processed, documentType);

    const s3Path = s3.buildS3Path({
        type: 'agent_kyc',
        agentId: agentObjectId.toString(),
        documentType: documentType.replace(/_/g, '-'),
    });

    const fileKey = await s3.uploadFileToS3(processed, s3Path);

    return { processed, fileKey, malwareScan };
};

const deleteOldFile = (fileKey) => {
    s3.deleteFromS3(fileKey).catch(() => {});
};

const getPreviewUrl = async (fileKey) => s3.getPresignedUrl(fileKey);

module.exports = {
    processAndUpload,
    deleteOldFile,
    getPreviewUrl,
};
