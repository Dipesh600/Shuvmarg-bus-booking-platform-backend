'use strict';

/**
 * document-proxy.storage.js
 *
 * The ONLY file in this module that may import @aws-sdk/client-s3.
 * All S3 interaction is isolated here so the rest of the module stays testable
 * without real AWS infrastructure.
 */

const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');

const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId:     process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
});

/**
 * Fetch an S3 object and return the raw SDK response.
 * Callers are responsible for streaming `s3Response.Body` and reading headers.
 *
 * @param {string} key   — resolved S3 object key (no leading slash)
 * @returns {Promise<import('@aws-sdk/client-s3').GetObjectCommandOutput>}
 */
async function fetchS3Object(key) {
    const command = new GetObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET_NAME,
        Key:    key,
    });
    return s3Client.send(command);
}

module.exports = {
    fetchS3Object,
};
