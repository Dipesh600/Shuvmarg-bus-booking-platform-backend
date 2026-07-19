# Agent admin conversion

[Back to agent admin modules](README.md)

## Purpose

The agent admin conversion module lets an admin add the `agent` role to an existing User and ensure an Agent profile document exists. It exists to move `POST /api/admin/makeUserAgent` out of the legacy admin-agent controller without changing role management or combining it with agent setup finalization.

## Who uses it

Admin clients calling `/api/admin/makeUserAgent`. The route is protected by `adminMiddleware`.

## Responsibilities

- Validate the submitted User id.
- Resolve the User document.
- Check the legacy multi-role fields.
- Add `agent` to `roles` without overwriting `role`.
- Ensure an Agent document exists for the User.
- Return the legacy conversion response.

## What this module does not do

- It does not finalize agent profile fields; `finalizeAgentSetup` remains in the legacy controller.
- It does not approve KYC or update application status.
- It does not send notifications.
- It does not change the User primary `role` field.

## Public endpoints

| Method | Full path | Middleware in order | Handler |
|---|---|---|---|
| POST | `/api/admin/makeUserAgent` | `adminMiddleware` | `agentConversion.makeUserAgent` |

## Request and response walkthrough

The endpoint reads `id` from the request body. Missing `id` returns `400` with `Id is required!`. Invalid ObjectId values return `400` with `Invalid user ID format!`. A valid ObjectId with no matching User returns `404` with `User not found!`.

The role check uses `user.roles` when it is populated; otherwise it falls back to `[user.role]`. If that resolved list already contains `agent`, the endpoint returns `400` with `User is already an agent!`.

On success, the endpoint returns `200` with `Agent role added to user successfully!` and `data.userId`, `data.roles`, `data.agentId`, and `data.agentMongoId`. The response roles are built from the original resolved roles plus `agent`.

Unexpected failures log with `makeUserAgent error:` and return `500` with `Internal Server Error!`.

## Flow walkthrough

1. `adminMiddleware` verifies the admin token.
2. The controller reads `req.body.id`.
3. The service checks for missing and invalid ObjectId values.
4. The repository loads `User.findById(id)`.
5. The policy resolves roles from `roles` or `role`.
6. The service rejects existing agent users before mutation.
7. The repository updates the User with `$addToSet: { roles: "agent" }` and `$set: { "roleActivatedAt.agent": new Date() }`.
8. Only after the User update, the repository checks `Agent.findOne({ user: user._id })`.
9. If missing, it creates and saves `new Agent({ user: user._id })`.
10. The service returns the legacy response shape.

## Authentication or ownership proof

The proof is an admin access token accepted by `adminMiddleware`. There is no user ownership check because this is an admin role-conversion endpoint.

## Data read and changed

| Model/document | Reads | Changes |
|---|---|---|
| `User` | `_id`, `roles`, `role` | Adds `agent` to `roles` with `$addToSet`; sets `roleActivatedAt.agent`; leaves primary `role` unchanged |
| `Agent` | Existing Agent by `user` | Creates and saves `new Agent({ user })` only when none exists |

## Dependencies

- `adminMiddleware` enforces admin authentication and role checks.
- `agent-conversion.repository` is the only conversion module file that imports `User`, `Agent`, and `mongoose`.
- `agent-conversion.policy` contains pure role resolution and response mapping.
- `asyncHandler` and `respond` provide the shared HTTP adapter pattern.

## Security-sensitive behavior

- The route remains protected by `adminMiddleware`.
- The User update occurs before Agent lookup, matching legacy ordering.
- The endpoint does not overwrite `user.role`.
- Existing Agent documents are reused.
- No notifications, status changes, KYC changes, or setup finalization happen in this flow.

## Tests

`tests/characterization/agent-admin-conversion.test.js` covers route protection, missing and invalid IDs, missing User, existing agent role, role fallback, primary-role preservation, role activation timestamp, creating and reusing Agent documents, exact success response, and exact generic 500 response.

`tests/unit/agent/admin/agent-conversion-policy.test.js` covers pure role fallback and response mapping. `tests/unit/agent/admin/agent-conversion-service.test.js` covers the User update before Agent lookup and missing-Agent creation ordering.

## Known limitations or inconsistencies

The response roles are derived from the original resolved roles plus `agent`, rather than re-reading the updated User. This is legacy behavior and is preserved.

## Safe extension guidance

Before changing this module, verify the role fallback, primary-role preservation, update query shape, User-update-before-Agent-lookup ordering, Agent reuse behavior, exact response fields, and generic 500 contract.

## Verification references

- Base branch: `dev`
- Verified source: `refactor/agent-admin-conversion` working tree
- Mount: `routes/indexRoute.js`
- Routes: `routes/adminRoutes/adminRoutes.js`
- Entry point: `src/modules/agent/admin/conversion/index.js`
- Implementation:
  - `src/modules/agent/admin/conversion/agent-conversion.controller.js`
  - `src/modules/agent/admin/conversion/agent-conversion.service.js`
  - `src/modules/agent/admin/conversion/agent-conversion.repository.js`
  - `src/modules/agent/admin/conversion/agent-conversion.policy.js`
- Middleware inspected:
  - `middleware/adminMiddleware.js`
- Models/utilities inspected:
  - `models/userModel.js`
  - `models/agentModel.js`
- Characterization tests inspected:
  - `tests/characterization/agent-admin-conversion.test.js`
- Unit tests inspected:
  - `tests/unit/agent/admin/agent-conversion-policy.test.js`
  - `tests/unit/agent/admin/agent-conversion-service.test.js`
- Validation command: `npm run test:agent-admin-conversion`
