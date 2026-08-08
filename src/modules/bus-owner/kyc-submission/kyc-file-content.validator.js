"use strict";

const { KycDocumentValidationError } = require("./kyc-submission.errors");

const PNG_END_MARKER = Buffer.from([
  0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44,
  0xae, 0x42, 0x60, 0x82,
]);
const PDF_ACTIVE_CONTENT_PATTERN =
  /\/(?:JavaScript|JS\b|Launch\b|EmbeddedFile\b|OpenAction\b|AA\b)/i;

function fail(field, message) {
  throw new KycDocumentValidationError(
    "KYC_UNSAFE_FILE_CONTENT",
    message,
    field
  );
}

function validatePdf(buffer, field) {
  const trailingWindow = buffer
    .subarray(Math.max(0, buffer.length - 2048))
    .toString("latin1");
  if (!/%%EOF[\u0000\t\n\f\r ]*$/.test(trailingWindow)) {
    fail(field, `PDF document in field '${field}' is incomplete or malformed.`);
  }

  const source = buffer.toString("latin1");
  if (PDF_ACTIVE_CONTENT_PATTERN.test(source)) {
    fail(field, `PDF document in field '${field}' contains active or embedded content.`);
  }
}

function validateJpeg(buffer, field) {
  if (
    buffer.length < 4 ||
    buffer[buffer.length - 2] !== 0xff ||
    buffer[buffer.length - 1] !== 0xd9
  ) {
    fail(field, `JPEG document in field '${field}' is incomplete or malformed.`);
  }
}

function validatePng(buffer, field) {
  if (
    buffer.length < PNG_END_MARKER.length ||
    !buffer.subarray(buffer.length - PNG_END_MARKER.length).equals(PNG_END_MARKER)
  ) {
    fail(field, `PNG document in field '${field}' is incomplete or malformed.`);
  }
}

function validateFileContent({ buffer, detectedFormat, field }) {
  if (detectedFormat === "pdf") validatePdf(buffer, field);
  else if (detectedFormat === "jpeg") validateJpeg(buffer, field);
  else if (detectedFormat === "png") validatePng(buffer, field);
  else fail(field, `Document in field '${field}' has an unsupported format.`);
}

module.exports = {
  PDF_ACTIVE_CONTENT_PATTERN,
  PNG_END_MARKER,
  validateFileContent,
};
