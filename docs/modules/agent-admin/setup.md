# Agent admin setup

[Back to agent admin modules](README.md)

## Purpose

The agent admin setup module finalizes an existing Agent profile after admin conversion. It exists to move `PATCH /api/admin/finalizeAgentSetup` out of the last legacy admin-agent controller without changing validation, field updates, approval behavior, or notifications.

## Who uses it

Admin clients calling `/api/admin/finalizeAgentSetup`. The route is protected by `adminMiddleware`.

## Responsibilities

- Resolve an Agent by Agent ObjectId or string `agentId`.
- Apply truthy personal, business, and settlement fields.
- Apply numeric commission fields and string admin notes.
- Approve operator-linked agents when the request `agentType` is `OPERATOR_LINKED`.
- Synchronize the linked User for operator-linked approval.
- Save the Agent before attempting welcome notifications.

## What this module does not do

- It does not create Agent roles; see [Agent admin conversion](conversion.md).
- It does not review submitted self-service KYC documents; see [Agent KYC review](../kyc/agent-review.md).
- It does not validate that a linked operator exists.
- It does not add email or FCM notification behavior.

## Public endpoints

| Method | Full path | Middleware in order | Handler |
|---|---|---|---|
| PATCH | `/api/admin/finalizeAgentSetup` | `adminMiddleware` | `agentSetup.finalizeAgentSetup` |

## Request and response walkthrough

The endpoint reads `id`, `agentType`, linked-operator fields, allowed routes, commission settings, admin notes, personal fields, business fields, and settlement fields from the body. Missing `id` returns `400` with `id is required`. A missing Agent returns `404` with `Agent not found`.

Agent lookup is by ObjectId first using `Agent.findById(id)` when valid. If that does not find an Agent, lookup falls back to `Agent.findOne({ agentId: id })`. There is no User-id lookup.

Success returns `200`. The message is request-value gated: `OPERATOR_LINKED` returns `Operator-linked agent created and approved!`; every other request returns `Agent profile updated.`. The response contains `agentId`, `agentMongoId`, `applicationStatus`, and `agentType`.

Unexpected failures log with `finalizeAgentSetup error:` and return `500` with `Internal Server Error!`.

## Flow walkthrough

1. `adminMiddleware` verifies the admin token.
2. The controller extracts the documented request fields.
3. The service validates `id` and loads the Agent by ObjectId or `agentId`.
4. If `agentType` is truthy, it assigns `agent.agentType`.
5. Operator-linked logic runs only when the request value is exactly `OPERATOR_LINKED`.
6. Operator-linked requests require a valid `linkedOperatorId`, but do not verify that the operator exists.
7. `busAccessScope` becomes the supplied value or `ALL_OPERATOR_BUSES`.
8. Raw `busAccessScope === "SPECIFIC_ROUTES"` requires non-empty `allowedRouteIds`; otherwise routes are cleared.
9. Operator-linked requests set `APPROVED`, `approvedAt`, `approvedBy`, and `submittedAt`, then update the User to `isVerified: true` and `status: "active"`.
10. Truthy regular fields and typed admin fields are applied.
11. The Agent is saved.
12. Operator-linked notifications run after save and are non-fatal.

## Authentication or ownership proof

The proof is an admin access token accepted by `adminMiddleware`. The endpoint does not perform user ownership checks.

## Data read and changed

| Model/document | Reads | Changes |
|---|---|---|
| `Agent` | `_id`, `agentId`, `user`, current setup fields | Profile fields, linked-operator fields, approval fields, commission fields, settlement fields |
| `User` | For operator-linked notification: selected `name phone` | For operator-linked approval: `isVerified: true`, `status: "active"` |

## Dependencies

- `adminMiddleware` protects the route.
- `agent-setup.repository` is the only setup module file that imports `Agent`, `User`, and `mongoose`.
- `agent-setup-notification.service` is the only setup module file that imports `sparro-otp` and `notification_manager`.
- `agent-setup.policy` owns pure field and response decisions.
- `asyncHandler` and `respond` provide the shared HTTP adapter pattern.

## Security-sensitive behavior

- Operator-linked behavior is gated by the request `agentType`, not the saved Agent value.
- User synchronization happens before Agent save.
- Notifications happen only after Agent save.
- SMS and local notification failures are logged as warnings and do not alter the successful response.
- Non-operator setup sends no notifications.
- Numeric zero and empty admin notes are accepted; empty strings for truthy fields are ignored.

## Tests

`tests/characterization/agent-admin-setup.test.js` covers route protection, validation responses, Agent ObjectId and string agentId lookups, DEFAULT field updates, numeric zero and empty admin notes, operator-linked validation, approval, User sync, notification payloads, success responses, and exact generic 500 behavior.

`tests/unit/agent/admin/agent-setup-policy.test.js` covers pure field and response decisions. `tests/unit/agent/admin/agent-setup-service.test.js` covers operation ordering and no-notification behavior. `tests/unit/agent/admin/agent-setup-notification-service.test.js` covers notification payloads and non-fatal failures.

## Known limitations or inconsistencies

Operator-linked setup validates only the format of `linkedOperatorId`; it does not check that the operator exists. Success-message and notification behavior depend on the request `agentType`, not the final saved Agent value.

## Safe extension guidance

Before changing this module, verify lookup order, request-value gating, field truthiness rules, User-sync-before-save ordering, save-before-notification ordering, notification copy, warning labels, and exact response bodies.

## Verification references

- Base branch: `dev`
- Verified source: `refactor/agent-admin-setup` working tree
- Mount: `routes/indexRoute.js`
- Routes: `routes/adminRoutes/adminRoutes.js`
- Entry point: `src/modules/agent/admin/setup/index.js`
- Implementation:
  - `src/modules/agent/admin/setup/agent-setup.controller.js`
  - `src/modules/agent/admin/setup/agent-setup.service.js`
  - `src/modules/agent/admin/setup/agent-setup.repository.js`
  - `src/modules/agent/admin/setup/agent-setup.policy.js`
  - `src/modules/agent/admin/setup/agent-setup-fields.js`
  - `src/modules/agent/admin/setup/agent-setup-notification.service.js`
- Middleware inspected:
  - `middleware/adminMiddleware.js`
- Models/utilities inspected:
  - `models/agentModel.js`
  - `models/userModel.js`
  - `handlers/sparro-otp.js`
  - `controllers/notificationController/notification_manager.js`
- Characterization tests inspected:
  - `tests/characterization/agent-admin-setup.test.js`
- Unit tests inspected:
  - `tests/unit/agent/admin/agent-setup-policy.test.js`
  - `tests/unit/agent/admin/agent-setup-service.test.js`
  - `tests/unit/agent/admin/agent-setup-notification-service.test.js`
- Validation command: `npm run test:agent-admin-setup`
