# Agent application status

[Back to agent self-service modules](README.md)

## Purpose

The Agent application-status module returns the current Agent application state, saved application fields, document previews, admin feedback and reapplication eligibility.

## Who uses it

Authenticated users whose active role is `agent` use this route from the Agent app. Unlike profile and dashboard, this route is intentionally reachable in every Agent application status.

## Responsibilities

- Read `req.userInfo?.id` and `req.userInfo?.name`.
- Load the Agent application by authenticated user ID.
- Return the no-application draft response when no Agent document exists.
- Resolve document preview URLs without mutating document input.
- Calculate the existing 24-hour reapplication window.
- Return the exact current response nesting and fields.

## What this module does not do

- It does not save application drafts.
- It does not upload documents.
- It does not submit applications.
- It does not require an approved Agent application.

## Public endpoints

| Method | Full path | Middleware in order | Handler |
|---|---|---|---|
| GET | `/api/agent/application/status` | `auth`, `verifyRoleFromDB`, `agentMiddleware` | `agentApplicationStatus.getApplicationStatus` |

## Request and response walkthrough

The endpoint has no request body.

Middleware responses happen before this module:

1. `auth` requires an access token.
2. `verifyRoleFromDB` reloads the User and checks account state, role drift, token version and force-password state.
3. `agentMiddleware` requires active role `agent`.

`requireVerifiedAgent` is not in this route chain.

Defensive module responses:

- Missing `req.userInfo?.id` returns `401` with `{ success: false, message: "Unauthorized." }`.
- Missing Agent application returns `200` with message `No application started yet.` and data `{ applicationStatus: "DRAFT", hasApplication: false, userName: req.userInfo?.name || null }`.
- Existing Agent application returns `200` with message `Application status retrieved.` and `hasApplication: true`.

For existing applications, `userName` is `agent.user?.name ?? null`.

## Flow walkthrough

1. Read `userId` and `userName` from `req.userInfo`.
2. If `userId` is missing, return the defensive `401`.
3. Query `Agent.findOne({ user: userId }).populate("user", "name").lean()`.
4. If no Agent exists, return the draft no-application response.
5. Resolve `agent.documents || []` through the document URL service.
6. Calculate reapplication eligibility.
7. Map the exact status response.
8. Return `200`.

## Authentication or ownership proof

The operation relies on a current access token, DB-backed User role verification, active role `agent`, and the Agent document whose `user` field matches the authenticated user ID.

## Data read and changed

| Model/document | Reads | Changes |
|---|---|---|
| `User` | Read by `verifyRoleFromDB`; populated from Agent as `user` with selected `name`. | None. |
| `Agent` | Read by `Agent.findOne({ user: userId }).populate("user", "name").lean()`. | None. |
| S3 object | Preview URL generated when a document `fileKey` is a non-HTTP key. | None. |

## Response data

Existing applications return:

- `hasApplication`
- `agentId`
- `applicationStatus`
- `agentType`
- `submittedAt`
- `approvedAt`
- `userName`
- `personal.district`
- `personal.municipality`
- `personal.placeName`
- `business.businessName`
- `business.shopAddress`
- `business.operationType`
- `business.claimedMonthlyVolume`
- `business.currentOperators`
- `business.referralSource`
- `identification.citizenshipNumber`
- `identification.nationalIdNumber`
- `identification.panNumber`
- `documents`
- `consents.termsAcceptedAt`
- `consents.whatsappConsent`
- `rejectionReason`
- `moreInfoRequest`
- `moreInfoRequestedAt`
- `isPermanentlyRejected`
- `canReapply`
- `reapplyAvailableAt`
- `createdAt`
- `updatedAt`

## Document URL behavior

Missing or empty documents return `[]`. Documents are processed with `Promise.all`. Mongoose-style subdocuments use `toObject()`; plain objects are cloned. The returned object keeps `fileKey`. A non-HTTP `fileKey` receives `previewUrl` from `getPresignedUrl(fileKey)`. Missing `fileKey` and HTTP `fileKey` values do not request a presigned URL.

## Reapplication calculation

The default is `canReapply: false` and `reapplyAvailableAt: null`. Eligibility is calculated only for non-permanent `REJECTED` applications. The reapplication window is exactly 24 hours from `rejectedAt`. Missing `rejectedAt` behaves as elapsed time `Infinity`, so `canReapply` is true. At exactly 24 hours, `canReapply` is true.

## Dependencies

- `routes/agentRoute/agentRoute.js` registers the route.
- `middleware/authMiddleware.js`, `middleware/verifyRoleFromDB.js` and `middleware/checkRole.js` protect the route.
- `src/modules/agent/application-status/agent-application-status.repository.js` performs the Agent query.
- `src/modules/agent/application-status/document-url.service.js` uses `services/s3Service.js` for preview URLs.
- `src/modules/agent/application-status/reapply-policy.js` calculates the 24-hour reapply rule.
- `src/modules/agent/application-status/agent-application-status.mapper.js` builds the response.
- `utils/logger.js` records unexpected failures.

## Security-sensitive behavior

- Do not add `requireVerifiedAgent`; every application status must be able to reach this endpoint.
- Keep the exact populated `.lean()` query.
- Keep the 24-hour reapply window and missing-`rejectedAt` behavior.
- Keep document URL resolution read-only and non-mutating.
- Do not expose additional Agent fields.

## Tests

- `tests/characterization/agent-application-status.test.js` verifies route middleware, role protection, all statuses reaching the route, no-application response, response nesting and no mutation.
- `tests/unit/agent/application-status/agent-application-status-repository.test.js` verifies the exact query, populate and `.lean()`.
- `tests/unit/agent/application-status/document-url-service.test.js` verifies document URL behavior.
- `tests/unit/agent/application-status/reapply-policy.test.js` verifies the 24-hour rule.
- `tests/unit/agent/application-status/agent-application-status-service.test.js` verifies orchestration and exact responses.
- `tests/unit/agent/application-status/agent-application-status-mapper.test.js` verifies response fields and no mutation.
- `tests/unit/agent/application-status/agent-application-status-controller.test.js` verifies DTO extraction, response forwarding and exact generic 500 logging.

## Known limitations or inconsistencies

No module-specific inconsistency beyond legacy compatibility was identified during this documentation pass.

## Safe extension guidance

Before changing this module, verify route middleware order, the populated query, document URL behavior, reapply timing boundaries and the exact response field list. Add characterization coverage before changing response nesting or document preview behavior.

## Verification references

- Base branch: `dev`
- Verified source: `refactor/agent-application-status` working tree
- Mount: `routes/indexRoute.js`
- Routes: `routes/agentRoute/agentRoute.js`
- Entry point: `src/modules/agent/application-status/index.js`
- Implementation:
  - `src/modules/agent/application-status/agent-application-status.controller.js`
  - `src/modules/agent/application-status/agent-application-status.service.js`
  - `src/modules/agent/application-status/agent-application-status.repository.js`
  - `src/modules/agent/application-status/agent-application-status.mapper.js`
  - `src/modules/agent/application-status/document-url.service.js`
  - `src/modules/agent/application-status/reapply-policy.js`
- Middleware inspected:
  - `middleware/authMiddleware.js`
  - `middleware/verifyRoleFromDB.js`
  - `middleware/checkRole.js`
- Models/utilities inspected:
  - `models/agentModel.js`
  - `models/userModel.js`
  - `services/s3Service.js`
  - `utils/logger.js`
- Characterization tests inspected:
  - `tests/characterization/agent-application-status.test.js`
- Unit tests inspected:
  - `tests/unit/agent/application-status/agent-application-status-controller.test.js`
  - `tests/unit/agent/application-status/agent-application-status-service.test.js`
  - `tests/unit/agent/application-status/agent-application-status-repository.test.js`
  - `tests/unit/agent/application-status/agent-application-status-mapper.test.js`
  - `tests/unit/agent/application-status/document-url-service.test.js`
  - `tests/unit/agent/application-status/reapply-policy.test.js`
- Validation command: `npm run test:agent-application-status`
