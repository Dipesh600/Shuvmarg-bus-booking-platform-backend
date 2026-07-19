# Agent admin directory

[Back to agent admin modules](README.md)

## Purpose

The agent admin directory module serves the admin panel’s read-only agent detail and listing screens. It exists to move `POST /api/admin/getAgentDetails` and `GET /api/admin/getAllAgents` out of the legacy admin-agent controller without changing lookups, filtering, document URL handling, or response fields.

## Who uses it

Admin clients calling `/api/admin/getAgentDetails` and `/api/admin/getAllAgents`. Both routes are protected by `adminMiddleware`.

## Responsibilities

- Fetch one Agent by supported identifier form and embed its selected User profile.
- Resolve KYC document preview URLs for stored S3 keys.
- List agents with the legacy optional `status` and `type` filters.
- Map Agent/User/operator fields into the existing admin-list response shape.

## What this module does not do

- It does not approve or reject KYC; see [Agent KYC review](../kyc/agent-review.md).
- It does not provide aggregate counts; see [Agent admin dashboard](dashboard.md).
- It does not convert users into agents or finalize agent setup.
- It does not mutate Agent or User records.

## Public endpoints

| Method | Full path | Middleware in order | Handler |
|---|---|---|---|
| POST | `/api/admin/getAgentDetails` | `adminMiddleware` | `agentDirectory.getAgentsById` |
| GET | `/api/admin/getAllAgents` | `adminMiddleware` | `agentDirectory.getAllAgents` |

## Request and response walkthrough

`POST /api/admin/getAgentDetails` reads `id` from the body. Missing `id` returns `400` with `Id is required!`. The service looks up an Agent by User ObjectId, then Agent ObjectId, then string `agentId`. A missing Agent returns `404` with `Agent not found!`.

On success, it returns `200` with `Agent details retrieved successfully!`. `data.profile` is the selected User document with `password` and `__v` excluded. `data.agentDetails` is the Agent document converted to a plain object. When a User is found, selected User fields are also embedded at `data.agentDetails.user`. Agent documents with S3 `fileKey` values receive `previewUrl`; existing HTTP file keys and documents without keys are left unchanged.

`GET /api/admin/getAllAgents` accepts raw optional query filters. `status` maps to `applicationStatus`; `type` maps to `agentType`. It returns `200` with `results` and `data`. Empty results use `No agents found.` and non-empty results use `Agents retrieved successfully!`.

Unexpected failures in either endpoint log with the legacy labels `getAgentsById error:` or `getAllAgents error:` and return `500` with `Internal Server Error!`.

## Flow walkthrough

Details:

1. `adminMiddleware` verifies the admin token.
2. The controller reads `req.body.id`.
3. The repository tries `Agent.findOne({ user: id })` when `id` is a valid ObjectId.
4. If no Agent is found, it tries `Agent.findById(id)`.
5. If still missing, it tries `Agent.findOne({ agentId: id })`.
6. For a found Agent, the repository selects the linked User with `-password -__v`.
7. The document-preview service resolves S3 preview URLs concurrently.
8. The mapper builds the legacy response nesting.

List:

1. `adminMiddleware` verifies the admin token.
2. The controller reads `req.query.status` and `req.query.type`.
3. The service maps those query values to the legacy Agent filter.
4. The repository runs `Agent.find(filter)`, populates `user` and `linkedOperatorId`, sorts by descending `createdAt`, and uses `.lean()`.
5. The mapper builds the legacy list fields and fallback values.

## Authentication or ownership proof

Both endpoints rely on an admin access token accepted by `adminMiddleware`. There is no per-agent ownership proof because these are admin directory endpoints.

## Data read and changed

| Model/document | Reads | Changes |
|---|---|---|
| `Agent` | User ObjectId, Agent ObjectId, string `agentId`, `applicationStatus`, `agentType`, linked operator, location, commission, booking totals, operation type, timestamps, documents | None |
| `User` | Selected public profile fields; list populate uses `name email phone profilePicture status` | None |
| `OperatorBrand` | Populated `brandName` and `brandCode` through `linkedOperatorId` | None |

## Dependencies

- `adminMiddleware` enforces admin authentication and role checks.
- `agent-directory.repository` is the only directory module file that imports `Agent`, `User`, and `mongoose`.
- `agent-document-preview.service` is the only directory module file that imports `services/s3Service.js`.
- `agent-directory.mapper` contains pure response mapping.
- `asyncHandler` and `respond` provide the shared HTTP adapter pattern.

## Security-sensitive behavior

- Both routes remain protected by `adminMiddleware`.
- The detail lookup order is User ObjectId, Agent ObjectId, then string `agentId`.
- The list endpoint does not add pagination, validation, search, or extra filters.
- Document URL resolution preserves existing HTTP URLs and only adds `previewUrl` for S3 keys.
- These endpoints are read-only, but they expose the same legacy admin-visible fields.

## Tests

`tests/characterization/agent-admin-directory.test.js` covers admin protection, missing ID, all three lookup forms, missing Agent, User embedding, S3 preview URLs, HTTP document URLs, unfiltered and filtered listing, empty responses, mapping fields, and exact generic 500 responses.

`tests/unit/agent/admin/agent-directory-mapper.test.js` covers pure response mapping. `tests/unit/agent/admin/agent-document-preview-service.test.js` covers document transformation and S3-key-only preview generation.

## Known limitations or inconsistencies

The list endpoint returns all matching records without pagination. The `status` and `type` query values are used directly as database filters without validation. The response continues to expose the legacy admin directory field set.

## Safe extension guidance

Before changing this module, verify route middleware, lookup order, populate selections, sorting, `.lean()`, document preview behavior, fallback values, error labels, and exact response messages.

## Verification references

- Base branch: `dev`
- Verified source: `refactor/agent-admin-directory` working tree
- Mount: `routes/indexRoute.js`
- Routes: `routes/adminRoutes/adminRoutes.js`
- Entry point: `src/modules/agent/admin/directory/index.js`
- Implementation:
  - `src/modules/agent/admin/directory/agent-directory.controller.js`
  - `src/modules/agent/admin/directory/agent-directory.service.js`
  - `src/modules/agent/admin/directory/agent-directory.repository.js`
  - `src/modules/agent/admin/directory/agent-directory.mapper.js`
  - `src/modules/agent/admin/directory/agent-document-preview.service.js`
- Middleware inspected:
  - `middleware/adminMiddleware.js`
- Models/utilities inspected:
  - `models/agentModel.js`
  - `models/userModel.js`
  - `models/operatorBrandModel.js`
  - `services/s3Service.js`
- Characterization tests inspected:
  - `tests/characterization/agent-admin-directory.test.js`
- Unit tests inspected:
  - `tests/unit/agent/admin/agent-directory-mapper.test.js`
  - `tests/unit/agent/admin/agent-document-preview-service.test.js`
- Validation command: `npm run test:agent-admin-directory`
