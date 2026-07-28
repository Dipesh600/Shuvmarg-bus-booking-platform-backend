const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const path = require("path");
const {
  buildS3Path,
  sanitizeSegment,
} = require("../src/modules/shared/storage/s3-object-key-builder.js");

const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
});

/**
 * Uploads a file buffer to S3 and returns the Object Key.
 * 
 * @param {object} file - The file object from express-fileupload
 * @param {string} folder - The S3 "folder" path (prefix). Use buildS3Path() to construct this.
 * @returns {string} - The S3 object key stored in MongoDB
 */
const uploadFileToS3 = async (file, folder) => {
    if (!file) return null;

    const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp", "application/pdf"];
    if (!allowedTypes.includes(file.mimetype)) {
        throw new Error(`Invalid file type: ${file.mimetype}. Allowed: JPEG, PNG, GIF, WEBP, PDF.`);
    }
    if (file.size > 20 * 1024 * 1024) {
        throw new Error("File size too large. Maximum 20MB allowed.");
    }

    const fileExtension = path.extname(file.name || "file").replace(".", "") || "bin";
    const timestamp = Date.now();
    const objectKey = `${folder}/${timestamp}.${fileExtension}`;

    const command = new PutObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET_NAME,
        Key: objectKey,
        Body: file.data,
        ContentType: file.mimetype,
    });

    await s3Client.send(command);

    // Return just the object key — stored in MongoDB, converted to presigned URL on read.
    return objectKey;
};


/**
 * Generates a temporary, 1-hour presigned URL for securely viewing private S3 objects.
 */
const getPresignedUrl = async (objectKey) => {
    if (!objectKey) return null;

    // If it's somehow already an http URL (legacy data), just return it
    if (objectKey.startsWith("http")) return objectKey;

    const command = new GetObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET_NAME,
        Key: objectKey,
    });

    // 1 hour — for sensitive private documents (KYC, driver docs, etc.)
    // Short-lived by design: only valid for the duration of one admin/staff session.
    return await getSignedUrl(s3Client, command, { expiresIn: 3600 });
};

/**
 * Generates a long-lived presigned URL (7 days — S3 maximum) for non-sensitive
 * display assets such as coupon/offer images.
 *
 * Why 7 days and not permanent:
 *   - The S3 bucket stays 100% private, no bucket policy or ACL changes needed.
 *   - 7 days is the AWS maximum for presigned URLs with IAM credentials.
 *   - URLs are always regenerated fresh on every API call, so a user loading
 *     the page always gets a URL valid for another 7 days from that moment.
 *   - In practice, a marketing banner image never needs to outlive a user session.
 *
 * Use this ONLY for public-facing display content that is not sensitive.
 */
const getDisplayUrl = async (objectKey) => {
    if (!objectKey) return null;
    if (objectKey.startsWith("http")) return objectKey; // already a full URL

    const command = new GetObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET_NAME,
        Key: objectKey,
    });

    // 7 days (604800 seconds) — S3 maximum for presigned URLs
    return await getSignedUrl(s3Client, command, { expiresIn: 604800 });
};

/**
 * Deletes one or more S3 objects by key. Used for orphan cleanup on failed DB writes.
 * Non-fatal: logs but does not throw on failure.
 * @param {string | string[]} keys - One or more S3 object keys to delete
 */
const deleteFromS3 = async (keys) => {
    const keyArray = Array.isArray(keys) ? keys : [keys];
    const results = await Promise.allSettled(
        keyArray.filter(Boolean).map(key =>
            s3Client.send(new DeleteObjectCommand({
                Bucket: process.env.AWS_S3_BUCKET_NAME,
                Key: key,
            }))
        )
    );
    results.forEach((r, i) => {
        if (r.status === "rejected") {
            console.warn(`[S3] Failed to delete orphaned key "${keyArray[i]}":`, r.reason?.message);
        }
    });
};

/**
 * Lists objects in a specific S3 folder prefix.
 * Used by background cron jobs to find orphaned assets.
 * @param {string} prefix - The S3 folder prefix (e.g. 'platform/coupons')
 * @returns {Array<{Key: string, LastModified: Date}>} - Array of object keys and their modification dates
 */
const listObjectsInFolder = async (prefix) => {
    if (!prefix) return [];
    
    // Ensure prefix has a trailing slash for exact folder matching if not already
    const searchPrefix = prefix.endsWith('/') ? prefix : `${prefix}/`;
    
    let isTruncated = true;
    let continuationToken = undefined;
    const allObjects = [];

    while (isTruncated) {
        const command = new ListObjectsV2Command({
            Bucket: process.env.AWS_S3_BUCKET_NAME,
            Prefix: searchPrefix,
            ContinuationToken: continuationToken,
        });

        const response = await s3Client.send(command);
        if (response.Contents) {
            allObjects.push(...response.Contents.map(obj => ({
                Key: obj.Key,
                LastModified: obj.LastModified,
            })));
        }
        
        isTruncated = response.IsTruncated;
        continuationToken = response.NextContinuationToken;
    }

    return allObjects;
};

module.exports = {
    uploadFileToS3,
    getPresignedUrl,    // 1 hour  — private/sensitive documents (KYC, driver docs, etc.)
    getDisplayUrl,      // 7 days  — non-sensitive display assets (coupon images etc.)
    deleteFromS3,
    listObjectsInFolder,
    buildS3Path,
    sanitizeSegment,
};
