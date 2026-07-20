'use strict';

/**
 * document-proxy.controller.js
 *
 * HTTP adapter for the document proxy.  Reads req.query.key, delegates all
 * logic to the service, then either writes response headers and pipes the S3
 * body or returns a JSON error.
 *
 * Does NOT import S3Client, GetObjectCommand, or any AWS SDK class directly.
 */

const service = require('./document-proxy.service.js');

/**
 * GET /api/agent/documents/view
 * GET /api/admin/documents/view
 *
 * Streams an S3 object to the browser — the presigned URL never leaves the server.
 *
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 */
const viewDocument = async (req, res) => {
    try {
        const result = await service.resolveDocument(req.query.key);

        if (!result.ok) {
            return res.status(result.status).json(result.body);
        }

        const { s3Response, resolvedKey } = result;

        // Forward content-type so the browser knows how to display the file
        const contentType = s3Response.ContentType || 'application/octet-stream';
        res.setHeader('Content-Type', contentType);

        // Suggest the filename from the last key segment
        const filename = resolvedKey.split('/').pop() || 'document';
        res.setHeader('Content-Disposition', `inline; filename="${filename}"`);

        if (s3Response.ContentLength) {
            res.setHeader('Content-Length', s3Response.ContentLength);
        }

        // Cache for 5 minutes in the browser (session only)
        res.setHeader('Cache-Control', 'private, max-age=300');

        // Pipe the S3 readable stream directly to the HTTP response
        s3Response.Body.pipe(res);
    } catch (error) {
        console.error('[documentProxy] viewDocument error:', error);
        return res.status(500).json({
            success: false,
            message: "Failed to retrieve document."
        });
    }
};

module.exports = {
    viewDocument,
};
