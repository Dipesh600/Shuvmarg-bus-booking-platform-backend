"use strict";

const CONTROL_CHAR_PATTERN = /[\u0000-\u001F\u007F]/;

function validatePathValue(value, name) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Invalid ${name}: must be a non-empty string.`);
  }

  if (value !== value.trim()) {
    throw new Error(`Invalid ${name}: leading or trailing whitespace is not allowed.`);
  }

  if (value.startsWith("/")) {
    throw new Error(`Invalid ${name}: leading slash is not allowed.`);
  }

  if (value.includes("\\")) {
    throw new Error(`Invalid ${name}: backslashes are not allowed.`);
  }

  if (CONTROL_CHAR_PATTERN.test(value)) {
    throw new Error(`Invalid ${name}: control characters are not allowed.`);
  }

  const segments = value.split("/");

  if (
    segments.some(
      (segment) =>
        segment.length === 0 ||
        segment === "." ||
        segment === ".." ||
        segment !== segment.trim()
    )
  ) {
    throw new Error(`Invalid ${name}: contains an unsafe path segment.`);
  }

  return value;
}

function normalizeUploadOptions(folderOrOptions) {
  if (!folderOrOptions) {
    throw new Error("S3 upload options or folder string must be provided.");
  }

  if (typeof folderOrOptions === "string") {
    const safeFolder = validatePathValue(folderOrOptions, "folder");
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
    const safeKey = validatePathValue(objectKey, "objectKey");
    return { objectKey: safeKey, folder: null, objectName: null };
  }

  if (folder !== undefined || objectName !== undefined) {
    if (!folder || !objectName) {
      throw new Error("Structured upload options require both 'folder' and 'objectName'.");
    }
    const safeFolder = validatePathValue(folder, "folder");
    const safeName = validatePathValue(objectName, "objectName");
    if (safeName.includes("/")) {
      throw new Error("Invalid objectName: slashes are not allowed.");
    }
    return { folder: safeFolder, objectName: safeName, objectKey: `${safeFolder}/${safeName}` };
  }

  throw new Error("Invalid upload options object. Must specify either 'objectKey' or both 'folder' and 'objectName'.");
}

module.exports = {
  normalizeUploadOptions,
  validatePathValue,
};
