const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const path = require("path");

const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
});

/**
 * Sanitizes a string to be safe for use as an S3 folder segment.
 * Lowercases, replaces spaces/special chars with hyphens, strips leading/trailing hyphens.
 */
const sanitizeSegment = (str) => {
    if (!str) return "unknown";
    return String(str)
        .toLowerCase()
        .replace(/[^a-z0-9-_]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 64);
};

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

    // URL expires in 1 hour (3600 seconds)
    return await getSignedUrl(s3Client, command, { expiresIn: 3600 });
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
 * ─── S3 Path Builder ────────────────────────────────────────────────────
 *
 * All S3 key prefixes MUST be constructed through this single helper.
 * This ensures a consistent, navigable folder structure across all uploads.
 *
 * Structure:
 *   Bus Owner KYC docs:
 *     owners/{busOwnerId}/kyc/{documentType}/
 *
 *   Fleet images:
 *     owners/{ownerId}/brands/{brandId}/fleets/{fleetId}/images/
 *
 *   Fleet documents:
 *     owners/{ownerId}/brands/{brandId}/fleets/{fleetId}/docs/{documentType}/
 *
 *   Driver documents:
 *     brands/{brandId}/drivers/{driverId}/docs/{documentType}/
 *
 *   Dispute proofs:
 *     disputes/{disputeType}/{transactionId}/
 *
 * NOTE: brandId (MongoDB ObjectId) is used instead of brandName because:
 *   - IDs are unique and immutable (brand names can be renamed or sanitize to collide)
 *   - Prevents path drift when a brand is renamed
 *
 * @param {object} options
 * @param {'owner_kyc' | 'fleet_images' | 'fleet_docs' | 'driver_docs' | 'dispute_proof'} options.type
 * @param {string} [options.ownerId]        - BusOwner's User._id (Mongo ObjectId string)
 * @param {string} [options.brandId]        - OperatorBrand._id (Mongo ObjectId string)
 * @param {string} [options.fleetId]        - Fleet.fleetId auto-generated field (e.g. "FL-001")
 * @param {string} [options.driverId]       - DriverProfile._id (Mongo ObjectId string)
 * @param {string} [options.documentType]   - e.g. "company-registration", "fitness-cert", "license"
 * @param {string} [options.disputeType]    - e.g. "booking-mismatch", "verification-lag", "general"
 * @param {string} [options.transactionId]  - Transaction MongoDB _id for dispute uploads
 * @returns {string} - S3 key prefix (no trailing slash)
 */
const buildS3Path = ({ type, ownerId, brandId, fleetId, driverId, documentType, disputeType, transactionId }) => {
    const ownerSegment = `owners/${sanitizeSegment(ownerId)}`;

    switch (type) {
        case "owner_kyc":
            return `${ownerSegment}/kyc/${sanitizeSegment(documentType)}`;

        case "fleet_images":
            // Use brandId for uniqueness; falls back to 'no-brand' when fleet has no brand
            return `${ownerSegment}/brands/${sanitizeSegment(brandId || "no-brand")}/fleets/${sanitizeSegment(fleetId)}/images`;

        case "fleet_docs":
            return `${ownerSegment}/brands/${sanitizeSegment(brandId || "no-brand")}/fleets/${sanitizeSegment(fleetId)}/docs/${sanitizeSegment(documentType)}`;

        case "driver_docs":
            // Driver docs are brand-scoped, not owner-scoped
            // brands/{brandId}/drivers/{driverId}/docs/{documentType}/
            return `brands/${sanitizeSegment(brandId)}/drivers/${sanitizeSegment(driverId)}/docs/${sanitizeSegment(documentType)}`;

        case "dispute_proof":
            // disputes/{disputeType}/{transactionId}/
            // disputeType: "booking-mismatch" | "verification-lag" | "general"
            return `disputes/${sanitizeSegment(disputeType || "general")}/${sanitizeSegment(transactionId)}`;

        case "scratch_theme":
            // platform/scratch-themes/
            // Platform-level assets — not tied to any owner/brand hierarchy
            return `platform/scratch-themes`;

        default:
            return `misc/${sanitizeSegment(type)}`;
    }
};

module.exports = {
    uploadFileToS3,
    getPresignedUrl,
    deleteFromS3,
    buildS3Path,
    sanitizeSegment,
};
