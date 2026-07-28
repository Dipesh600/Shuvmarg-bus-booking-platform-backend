'use strict';

const { processFile } = require('../../../../services/fileProcessor.js');
const { uploadFileToS3, getPresignedUrl, deleteFromS3, buildS3Path } = require('../../../../services/s3Service.js');

const processAndUpload = async (file, agentObjectId, documentType) => {
    const processed = await processFile(file, { preset: 'document' });

    const s3Path = buildS3Path({
        type: 'agent_kyc',
        agentId: agentObjectId.toString(),
        documentType: documentType.replace(/_/g, '-'),
    });

    const fileKey = await uploadFileToS3(processed, s3Path);

    return { processed, fileKey };
};

const deleteOldFile = (fileKey) => {
    deleteFromS3(fileKey).catch(() => {});
};

const getPreviewUrl = async (fileKey) => getPresignedUrl(fileKey);

module.exports = {
    processAndUpload,
    deleteOldFile,
    getPreviewUrl,
};
