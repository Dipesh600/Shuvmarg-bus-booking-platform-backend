# Agent Application Document Upload Module

This module handles KYC document uploads for an agent's application. Files are processed through the shared `fileProcessor` pipeline (compression for images, pass-through for PDFs), uploaded to S3, and their object keys stored in the agent's `documents` array.

## Module walkthrough

*   **Controller (`agent-application-document-upload.controller.js`)**: Reads `req.userInfo?.id`, `req.body.documentType`, and `req.files?.file`. Delegates to the service, logs exact metadata on success, and handles the file-validation 400 path for `Invalid file type` / `File too large` errors thrown by the S3/fileProcessor layer.
*   **Service (`agent-application-document-upload.service.js`)**: Orchestrates the upload flow: agent lookup, status gate, document-type validation, file presence check, process+upload, document array update (replace or push), save, presigned-URL generation, and result shape.
*   **Repository (`agent-application-document-upload.repository.js`)**: Encapsulates `Agent.findOne({ user: userId })` and `agent.save()`.
*   **Policy (`agent-application-document-upload.policy.js`)**: Defines `isUploadableStatus()` (allows `DRAFT` and `MORE_INFO`) and exports `VALID_DOCUMENT_TYPES`.
*   **Document Type Policy (`document-type.policy.js`)**: Exports `isValidDocumentType(type)` and re-exports `VALID_DOCUMENT_TYPES` from the main policy.
*   **Document Storage Service (`document-storage.service.js`)**: Wraps `processFile`, `buildS3Path`, `uploadFileToS3`, `getPresignedUrl`, and `deleteFromS3`. The `deleteOldFile` helper is best-effort — it calls `deleteFromS3(...).catch(() => {})` to match the legacy behavior.

## API Endpoint

`POST /api/agent/application/document`

### Middleware Chain

1.  `auth`: Verifies the authentication token.
2.  `verifyRoleFromDB`: Ensures the user's role matches the database.
3.  `agentMiddleware`: Enforces that the user has the `agent` role.
4.  `agentApplicationDocumentUpload.uploadDocument`: The core controller handling the request.

*(Note: `requireApprovedAgent` is deliberately excluded because document upload occurs prior to approval.)*

### Request

Multipart form data:

| Field          | Type   | Required | Description                         |
|----------------|--------|----------|-------------------------------------|
| `documentType` | string | yes      | One of the valid document types     |
| `file`         | file   | yes      | Image (JPEG, PNG, GIF, WebP) or PDF |

### Valid Document Types

*   `citizenship_front`
*   `citizenship_back`
*   `national_id_front`
*   `national_id_back`
*   `shop_photo`
*   `pan_card`
*   `business_registration`

## Uploadable Statuses

Uploads are only accepted when `applicationStatus` is:

*   `DRAFT` — initial application state
*   `MORE_INFO` — admin has requested additional information

Any other status (`PENDING`, `APPROVED`, `REJECTED`, `SUSPENDED`) results in a 400 error.

## Document Replacement Behavior

When a document with the same `type` already exists in the agent's `documents` array:

*   The existing entry is replaced with full verification reset (`verified: false`, `verifiedBy: null`, `verifiedAt: null`, `rejectionReason: null`, `uploadedAt: new Date()`).
*   The old S3 object key is passed to `deleteOldFile` (best-effort, non-fatal).

When the document type is new:

*   A new entry `{ type, fileKey, uploadedAt }` is pushed to the array.

## S3 Path Structure

```
agents/{agentId}/kyc/{document-type}/
```

`documentType` underscores are replaced with hyphens when building the S3 path (e.g., `pan_card` → `pan-card`).

## Responses

### Success
```json
{
  "success": true,
  "message": "pan_card uploaded successfully.",
  "data": {
    "documentType": "pan_card",
    "previewUrl": "https://...",
    "wasCompressed": false,
    "originalSize": 102400,
    "compressedSize": 102400
  }
}
```

### Errors

**Unauthorized (Missing/Invalid Token)**
```json
{ "status": false, "message": "Authorization header is missing or invalid" }
```

**Role Denied (Not an Agent)**
```json
{ "success": false, "message": "Access denied. Required: agent.", "errorCode": "INSUFFICIENT_ROLE" }
```

**No Agent Record**
```json
{ "success": false, "status": 404, "message": "Start your application first before uploading documents." }
```

**Non-Uploadable Status**
```json
{ "success": false, "status": 400, "message": "Cannot upload documents in \"PENDING\" status." }
```

**Invalid Document Type**
```json
{ "success": false, "status": 400, "message": "Invalid document type. Must be one of: citizenship_front, citizenship_back, national_id_front, national_id_back, shop_photo, pan_card, business_registration" }
```

**Missing File**
```json
{ "success": false, "status": 400, "message": "No file provided. Send file in 'file' field." }
```

**Invalid File Type or Too Large (from fileProcessor / S3 layer)**
```json
{ "success": false, "status": 400, "message": "Invalid file type: image/bmp. Allowed: JPEG, PNG, GIF, WEBP, PDF." }
```

**Internal Error**
```json
{ "success": false, "status": 500, "message": "Internal Server Error" }
```
