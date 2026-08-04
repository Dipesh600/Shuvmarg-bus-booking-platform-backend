"use strict";

function assertPathSafety(val, name) {
  if (typeof val !== "string" || val.trim() === "") {
    throw new Error(`Invalid ${name}: must be a non-empty string.`);
  }
  const normalized = val.trim();
  if (normalized.startsWith("/")) {
    throw new Error(`Invalid ${name} '${val}': leading slashes are not allowed.`);
  }
  if (normalized.includes("\\")) {
    throw new Error(`Invalid ${name} '${val}': backslashes are not allowed.`);
  }
  if (normalized.split("/").some((part) => part === "..")) {
    throw new Error(`Invalid ${name} '${val}': path traversal '..' is not allowed.`);
  }
  return normalized;
}

function normalizeUploadOptions(folderOrOptions) {
  if (!folderOrOptions) {
    throw new Error("S3 upload options or folder string must be provided.");
  }

  if (typeof folderOrOptions === "string") {
    const safeFolder = assertPathSafety(folderOrOptions, "folder");
    return { folder: safeFolder, objectName: null, objectKey: null };
  }

  if (typeof folderOrOptions !== "object" || Array.isArray(folderOrOptions)) {
    throw new Error("S3 upload options must be a valid options object or folder string.");
  }

  const { objectKey, folder, objectName } = folderOrOptions;

  if (objectKey !== undefined) {
    if (folder !== undefined || objectName !== undefined) {
      throw new Error("Ambiguous upload options: 'objectKey' cannot be combined with 'folder' or 'objectName'.");
    }
    const safeKey = assertPathSafety(objectKey, "objectKey");
    return { objectKey: safeKey, folder: null, objectName: null };
  }

  if (folder !== undefined || objectName !== undefined) {
    if (!folder || !objectName) {
      throw new Error("Structured upload options require both 'folder' and 'objectName'.");
    }
    const safeFolder = assertPathSafety(folder, "folder");
    const safeName = assertPathSafety(objectName, "objectName");
    if (safeName.includes("/")) {
      throw new Error(`Invalid objectName '${objectName}': object name cannot contain slashes.`);
    }
    return { folder: safeFolder, objectName: safeName, objectKey: `${safeFolder}/${safeName}` };
  }

  throw new Error("Invalid upload options object. Must specify either 'objectKey' or both 'folder' and 'objectName'.");
}

module.exports = {
  normalizeUploadOptions,
};
