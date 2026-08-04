const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const path = require("path");
const { buildS3Path, sanitizeSegment } = require("../src/modules/shared/storage/s3-object-key-builder.js");
const { normalizeUploadOptions } = require("../src/modules/shared/storage/s3-upload-options.js");

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const uploadFileToS3 = async (file, folderOrOptions) => {
  if (!file) return null;

  const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp", "application/pdf"];
  if (!allowedTypes.includes(file.mimetype)) {
    throw new Error(`Invalid file type: ${file.mimetype}. Allowed: JPEG, PNG, GIF, WEBP, PDF.`);
  }
  if (file.size > 20 * 1024 * 1024) {
    throw new Error("File size too large. Maximum 20MB allowed.");
  }

  const options = normalizeUploadOptions(folderOrOptions);
  let objectKey = options.objectKey;

  if (!objectKey) {
    if (options.folder && options.objectName) {
      objectKey = `${options.folder}/${options.objectName}`;
    } else {
      const fileExtension = path.extname(file.name || "file").replace(".", "") || "bin";
      objectKey = `${options.folder}/${Date.now()}.${fileExtension}`;
    }
  }

  const command = new PutObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET_NAME,
    Key: objectKey,
    Body: file.data,
    ContentType: file.mimetype,
  });

  await s3Client.send(command);
  return objectKey;
};

const getPresignedUrl = async (objectKey) => {
  if (!objectKey) return null;
  if (typeof objectKey === "string" && objectKey.startsWith("http")) return objectKey;

  const command = new GetObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET_NAME,
    Key: objectKey,
  });
  return await getSignedUrl(s3Client, command, { expiresIn: 3600 });
};

const getDisplayUrl = async (objectKey) => {
  if (!objectKey) return null;
  if (typeof objectKey === "string" && objectKey.startsWith("http")) return objectKey;

  const command = new GetObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET_NAME,
    Key: objectKey,
  });
  return await getSignedUrl(s3Client, command, { expiresIn: 604800 });
};

const deleteObjectFromS3 = async (objectKey) => {
  if (!objectKey || typeof objectKey !== "string") {
    throw new Error("S3 delete key must be a non-empty string.");
  }
  const command = new DeleteObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET_NAME,
    Key: objectKey,
  });
  await s3Client.send(command);
  return objectKey;
};

const deleteFromS3 = async (keys) => {
  const keyArray = Array.isArray(keys) ? keys : [keys];
  const results = await Promise.allSettled(
    keyArray.filter(Boolean).map((key) => deleteObjectFromS3(key))
  );
  results.forEach((r, i) => {
    if (r.status === "rejected") {
      console.warn(`[S3] Failed to delete orphaned key "${keyArray[i]}":`, r.reason?.message);
    }
  });
};

const listObjectsInFolder = async (prefix) => {
  if (!prefix) return [];
  const searchPrefix = prefix.endsWith("/") ? prefix : `${prefix}/`;
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
      allObjects.push(...response.Contents.map((obj) => ({ Key: obj.Key, LastModified: obj.LastModified })));
    }
    isTruncated = response.IsTruncated;
    continuationToken = response.NextContinuationToken;
  }
  return allObjects;
};

module.exports = {
  uploadFileToS3,
  getPresignedUrl,
  getDisplayUrl,
  deleteObjectFromS3,
  deleteFromS3,
  listObjectsInFolder,
  buildS3Path,
  sanitizeSegment,
};
