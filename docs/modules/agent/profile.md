# Agent profile

[Back to agent self-service modules](README.md)

## Purpose

The Agent profile module returns the verified agent’s operational profile, linked operator reference, settlement fields, commission counters and marketing identifiers.

## Who uses it

The route is for authenticated users whose current active role is `agent` and whose agent verification is cleared.

## Responsibilities

- Read the authenticated user ID from `req.userInfo?.id`.
- Load the Agent document for that user with the linked operator populated.
- Preserve the handler’s defensive missing-profile and verification checks.
- Return the exact existing profile response fields.

## What this module does not do

- It does not edit the Agent application.
- It does not upload or proxy KYC documents.
- It does not expose User profile fields.
- It does not calculate dashboard totals.

## Public endpoints

| Method | Full path | Middleware in order | Handler |
|---|---|---|---|
| GET | `/api/agent/profile` | `auth`, `verifyRoleFromDB`, `agentMiddleware`, `requireVerifiedAgent` | `agentProfile.getProfile` |

## Request and response walkthrough

The endpoint has no request body.

Middleware runs before the profile module:

1. `auth` requires an access token and populates `req.userInfo`.
2. `verifyRoleFromDB` reloads the User and checks account state, role drift, token version and force-password state.
3. `agentMiddleware` requires active role `agent`.
4. `requireVerifiedAgent` requires an Agent whose own verification is cleared. That is `applicationStatus: "APPROVED"` for a PLATFORM-scope agent and `VERIFIED_BASIC` for an OPERATOR-scope one — see `src/shared/identity/agent-verification.js`.

The profile module still keeps defensive handler responses:

- Missing `req.userInfo?.id` returns `401` with `{ success: false, message: "Unauthorized." }`.
- Missing Agent returns `404` with `{ success: false, message: "Agent profile not found." }`.
- An Agent whose verification is not cleared returns `403` with the dynamic message `Your application is "<status>". Profile is available once your verification is complete.` and `data.applicationStatus`.
- Success returns `200` with `success: true`, message `Agent profile retrieved.`, and `data`.

Successful `data` contains exactly:

- `agentId`
- `agentType`
- `applicationStatus`
- `linkedOperator`
- `businessName`
- `shopAddress`
- `operationType`
- `district`
- `municipality`
- `commissionRate`
- `commissionBalance`
- `minSettlementThreshold`
- `totalOnlineBookings`
- `totalCashBookings`
- `totalCommissionEarned`
- `totalCommissionSettled`
- `lastBookingAt`
- `settlementMethod`
- `referralCode`
- `qrCodeUrl`
- `approvedAt`
- `createdAt`

`linkedOperator` is `agent.linkedOperatorId || null`.

Unexpected errors are logged with `logger.error("agent: getProfile error", { error: error.message })` and return `500` with `{ success: false, message: "Internal Server Error" }`.

## Flow walkthrough

1. Read `userId` from `req.userInfo?.id`.
2. If absent, return the defensive `401`.
3. Query `Agent.findOne({ user: userId }).populate("linkedOperatorId", "brandName logo brandCode").lean()`.
4. If no Agent is found, return the defensive `404`.
5. If `isAgentVerificationCleared(agent)` is false, return the defensive dynamic `403`.
6. Map the loaded Agent fields directly into the response.
7. Return the exact `200` success body.

## Authentication or ownership proof

The operation relies on a current access token, DB-backed User role verification, active role `agent`, cleared agent verification, and the Agent document whose `user` field matches the authenticated user ID.

## Data read and changed

| Model/document | Reads | Changes |
|---|---|---|
| `User` | Read by `verifyRoleFromDB`; linked-operator ownership is not checked by this module. | None. |
| `Agent` | `requireVerifiedAgent` reads scope and KYC status. The module reads the Agent by `user` and populates `linkedOperatorId`. | None. |
| `OperatorBrand` | Read through `linkedOperatorId` population for `brandName`, `logo` and `brandCode`. | None. |

## Dependencies

- `routes/agentRoute/agentRoute.js` registers the route.
- `middleware/authMiddleware.js`, `middleware/verifyRoleFromDB.js`, `middleware/checkRole.js` and `middleware/requireVerifiedAgent.js` protect the route.
- `src/modules/agent/profile/agent-profile.repository.js` performs the populated Agent read.
- `src/modules/agent/profile/agent-profile.mapper.js` maps the response without side effects.
- `utils/logger.js` records unexpected handler failures.

## Security-sensitive behavior

- Keep middleware order unchanged.
- Keep the handler’s defensive verification check even though `requireVerifiedAgent` runs first.
- Keep the exact populated query and `.lean()`.
- Do not add fields, defaults or transformations to the profile response.
- Do not mutate Agent, User or OperatorBrand data from this endpoint.

## Tests

- `tests/characterization/agent-profile.test.js` verifies the public route, middleware chain, verification protection, linked-operator response, null linked operator response and exact success fields.
- `tests/unit/agent/profile/agent-profile-controller.test.js` verifies DTO extraction and exact 500 logging.
- `tests/unit/agent/profile/agent-profile-service.test.js` verifies defensive 401, 404, 403 and success mapping.
- `tests/unit/agent/profile/agent-profile-repository.test.js` verifies `Agent.findOne({ user }).populate(...).lean()`.
- `tests/unit/agent/profile/agent-profile-mapper.test.js` verifies exact response field names.

## Known limitations or inconsistencies

The route-level `requireVerifiedAgent` middleware usually rejects missing Agent records, and Agents whose verification is not cleared, before the profile module runs. The profile module still preserves its own `404` and dynamic `403` defensive responses. Both call `isAgentVerificationCleared`, so the gate and the handler cannot disagree about the same agent.

## Safe extension guidance

Before changing this module, verify the route middleware order, the populated query, the exact response field list and the distinction between middleware responses and module defensive responses. Add characterization coverage before adding or removing any profile field.

## Verification references

- Base branch: `dev`
- Verified source: `refactor/agent-profile` working tree
- Mount: `routes/indexRoute.js`
- Routes: `routes/agentRoute/agentRoute.js`
- Entry point: `src/modules/agent/profile/index.js`
- Implementation:
  - `src/modules/agent/profile/agent-profile.controller.js`
  - `src/modules/agent/profile/agent-profile.service.js`
  - `src/modules/agent/profile/agent-profile.repository.js`
  - `src/modules/agent/profile/agent-profile.mapper.js`
- Middleware inspected:
  - `middleware/authMiddleware.js`
  - `middleware/verifyRoleFromDB.js`
  - `middleware/checkRole.js`
  - `middleware/requireVerifiedAgent.js`
- Models/utilities inspected:
  - `models/agentModel.js`
  - `models/userModel.js`
  - `models/operatorBrandModel.js`
  - `utils/logger.js`
- Characterization tests inspected:
  - `tests/characterization/agent-profile.test.js`
- Unit tests inspected:
  - `tests/unit/agent/profile/agent-profile-controller.test.js`
  - `tests/unit/agent/profile/agent-profile-service.test.js`
  - `tests/unit/agent/profile/agent-profile-repository.test.js`
  - `tests/unit/agent/profile/agent-profile-mapper.test.js`
- Validation command: `npm run test:agent-profile`
