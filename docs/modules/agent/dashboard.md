# Agent dashboard

[Back to agent self-service modules](README.md)

## Purpose

The Agent dashboard module returns the read-only commission and booking counters shown on an approved agent’s home screen.

## Who uses it

The route is for authenticated users whose current active role is `agent` and whose Agent application is approved.

## Responsibilities

- Read the authenticated user ID from `req.userInfo?.id`.
- Load the Agent document for that user.
- Return the existing dashboard fields without recalculation or transformation.
- Preserve the handler’s defensive approval check even though `requireApprovedAgent` already protects the route.

## What this module does not do

- It does not create, update or submit Agent applications.
- It does not upload or review KYC documents.
- It does not calculate financial source-of-truth values.
- It does not bypass the route-level approval middleware.

## Public endpoints

| Method | Full path | Middleware in order | Handler |
|---|---|---|---|
| GET | `/api/agent/dashboard` | `auth`, `verifyRoleFromDB`, `agentMiddleware`, `requireApprovedAgent` | `agentDashboard.getDashboard` |

## Request and response walkthrough

The endpoint has no request body.

Middleware runs first:

1. `auth` requires an access token and populates `req.userInfo`.
2. `verifyRoleFromDB` reloads the User, checks account state, role drift, token version and force-password state.
3. `agentMiddleware` requires the active role to be `agent`.
4. `requireApprovedAgent` requires an Agent document with `applicationStatus: "APPROVED"`.

The handler then performs its own defensive checks:

- Missing `req.userInfo?.id` returns `401` with `{ success: false, message: "Unauthorized." }`.
- Missing Agent, or an Agent whose `applicationStatus` is not `APPROVED`, returns `403` with `{ success: false, message: "Dashboard available after application approval." }`.
- Success returns `200` with `success: true` and `data`.

Successful `data` contains exactly:

- `commissionBalance`
- `totalOnlineBookings`
- `totalCashBookings`
- `totalCommissionEarned`
- `totalCommissionSettled`
- `lastBookingAt`
- `commissionRate`
- `agentType`

Unexpected errors are logged with `logger.error("agent: getDashboard error", { error: error.message })` and return `500` with `{ success: false, message: "Internal Server Error" }`.

## Flow walkthrough

1. Read `userId` from `req.userInfo?.id`.
2. If absent, return the defensive `401`.
3. Query `Agent.findOne({ user: userId }).lean()`.
4. If no Agent is found, or the status is not `APPROVED`, return the defensive `403`.
5. Map the loaded Agent fields directly into the response body.
6. Return the `200` response.

## Authentication or ownership proof

The operation relies on a current access token, DB-backed role verification, active role `agent`, and approved Agent application status. Ownership is the Agent document whose `user` field matches the authenticated user ID.

## Data read and changed

| Model/document | Reads | Changes |
|---|---|---|
| `User` | Read by `verifyRoleFromDB` for account status, role and token-version checks. | None. |
| `Agent` | `requireApprovedAgent` reads approval status. The handler reads `Agent.findOne({ user: userId }).lean()`. | None. |

## Dependencies

- `routes/agentRoute/agentRoute.js` registers the route.
- `middleware/authMiddleware.js`, `middleware/verifyRoleFromDB.js`, `middleware/checkRole.js` and `middleware/requireApprovedAgent.js` protect the route.
- `src/modules/agent/dashboard/agent-dashboard.repository.js` performs the Agent read.
- `src/modules/agent/dashboard/agent-dashboard.mapper.js` maps the response without side effects.
- `utils/logger.js` records unexpected handler failures.

## Security-sensitive behavior

- Keep middleware order unchanged. `requireApprovedAgent` must remain before the handler.
- Keep the handler’s own approval check; it is a defensive duplicate of the middleware approval gate.
- Keep `.lean()` on the Agent query.
- Do not add dashboard fields or recalculate totals in this refactor-style module.
- Do not mutate Agent or User data from this endpoint.

## Tests

- `tests/characterization/agent-dashboard.test.js` verifies the public route, middleware chain, approval protection, exact success fields and no Agent mutation.
- `tests/unit/agent/dashboard/agent-dashboard-controller.test.js` verifies DTO extraction, response forwarding and exact generic 500 logging.
- `tests/unit/agent/dashboard/agent-dashboard-service.test.js` verifies defensive 401/403 and success mapping.
- `tests/unit/agent/dashboard/agent-dashboard-repository.test.js` verifies `Agent.findOne({ user }).lean()`.
- `tests/unit/agent/dashboard/agent-dashboard-mapper.test.js` verifies exact response fields.

## Known limitations or inconsistencies

The route-level `requireApprovedAgent` middleware rejects non-approved Agents before the handler runs, but the handler still contains its own non-approved-Agent `403` response. This duplicate defensive check is preserved for compatibility.

## Safe extension guidance

Before changing this module, verify the route middleware order, the exact Agent query, the response field list, and the distinction between middleware rejection responses and handler defensive responses. If dashboard values need new calculations, add characterization coverage before changing the mapper or service.

## Verification references

- Base branch: `dev`
- Verified source: `refactor/agent-dashboard` working tree
- Mount: `routes/indexRoute.js`
- Routes: `routes/agentRoute/agentRoute.js`
- Entry point: `src/modules/agent/dashboard/index.js`
- Implementation:
  - `src/modules/agent/dashboard/agent-dashboard.controller.js`
  - `src/modules/agent/dashboard/agent-dashboard.service.js`
  - `src/modules/agent/dashboard/agent-dashboard.repository.js`
  - `src/modules/agent/dashboard/agent-dashboard.mapper.js`
- Middleware inspected:
  - `middleware/authMiddleware.js`
  - `middleware/verifyRoleFromDB.js`
  - `middleware/checkRole.js`
  - `middleware/requireApprovedAgent.js`
- Models/utilities inspected:
  - `models/agentModel.js`
  - `models/userModel.js`
  - `utils/logger.js`
- Characterization tests inspected:
  - `tests/characterization/agent-dashboard.test.js`
- Unit tests inspected:
  - `tests/unit/agent/dashboard/agent-dashboard-controller.test.js`
  - `tests/unit/agent/dashboard/agent-dashboard-service.test.js`
  - `tests/unit/agent/dashboard/agent-dashboard-repository.test.js`
  - `tests/unit/agent/dashboard/agent-dashboard-mapper.test.js`
- Validation command: `npm run test:agent-dashboard`
