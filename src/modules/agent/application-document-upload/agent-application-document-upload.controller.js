'use strict';

const logger = require('../../../../utils/logger.js');
const service = require('./agent-application-document-upload.service.js');

const uploadDocument = async (req, res) => {
    try {
        const userId = req.userInfo?.id;
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Unauthorized.' });
        }

        const { documentType } = req.body;
        const file = req.files?.file;

        const result = await service.processDocumentUpload(userId, documentType, file);

        if (!result.success) {
            return res.status(result.status).json({ success: false, message: result.message });
        }

        logger.info('agent: document uploaded', {
            userId,
            agentId: result.agentId,
            documentType,
            wasCompressed: result.wasCompressed,
            originalSize: result.originalSize,
            compressedSize: result.compressedSize,
        });

        return res.status(200).json({
            success: true,
            message: result.message,
            data: result.data,
        });
    } catch (error) {
        if (error.name === 'KycMalwareScanError') {
            return res.status(error.statusCode || 503).json({ success: false, message: error.message, errorCode: error.code });
        }
        if (error.message.includes('Invalid file type') || error.message.includes('File too large')) {
            return res.status(400).json({ success: false, message: error.message });
        }
        logger.error('agent: uploadDocument error', { error: error.message });
        return res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
};

module.exports = {
    uploadDocument,
};
