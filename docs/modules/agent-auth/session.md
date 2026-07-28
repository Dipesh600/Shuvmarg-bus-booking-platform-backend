# Agent session

[Back to agent authentication](README.md)

Related: [general session](../auth/session.md).

## Purpose

Agent session refreshes agent access tokens and logs out agent sessions using agent-specific response contracts.

## Who uses it

Agent clients holding refresh tokens created with `activeRole: "agent"`.

## Responsibilities

- Refresh agent sessions by rotating refresh tokens.
- Set replacement refresh-token cookies.
- Logout by revoking a single refresh token, clearing the cookie, and optionally incrementing `tokenVersion`.
- Preserve logout failure behavior as successful `200` responses.

## What this module does not do

- It does not require auth middleware on refresh or logout.
- It does not revoke all user tokens on logout.
- It does not return refresh tokens in JSON.

## Public endpoints

| Method | Full path | Middleware in order | Handler |
|---|---|---|---|
| POST | `/api/auth/agent/refresh` | None at route level | `agentSession.refresh` |
| POST | `/api/auth/agent/logout` | None at route level | `agentSession.logout` |

## Request and response walkthrough

Both endpoints read refresh token from cookie first, then body. Refresh missing token returns `401 Session expired. Please sign in again.` The controller forwards `deviceInfo` from `req.headers["user-agent"] || null` and `ipAddress` from `req.ip || null`. Successful refresh sets a replacement `refreshToken` cookie and returns `accessToken` only.

Refresh maps token-service errors by message: invalid/expired token to `401` session expired, `ACCOUNT_BANNED` to `403 Your account has been suspended.`, `ROLE_REVOKED` to `403 Access revoked. Please contact support.`, and unknown failures to `401 Session could not be renewed. Please sign in again.`

Logout normal path is revoke refresh token if present, clear cookie, read optional `req.userInfo?.id`, increment `tokenVersion` if present, then return `Logged out successfully.` Any error is swallowed, the cookie is cleared again, and the fallback body is `Logged out.`

## Flow walkthrough

Refresh: token extraction → missing-token check → rotate → set cookie if new token → return access token.

Logout: token extraction → revoke → clear cookie → optional tokenVersion increment → normal success. On any failure, catch → clear cookie again → fallback success.

## Authentication or ownership proof

Refresh and logout rely on refresh-token possession. There is no route-level access-token middleware.

## Data read and changed

| Model/document | Reads | Changes |
|---|---|---|
| `RefreshToken` | Token hash and active role via `tokenService.rotateRefreshToken` | Refresh deletes old token and creates new token; logout deletes one token. |
| `User` | Refresh loads user through token service; logout may use optional request user ID | Refresh checks account state/role; logout may increment `tokenVersion`. |

## Dependencies

- `tokenService.rotateRefreshToken` preserves active role during refresh.
- `tokenService.revokeRefreshToken` revokes one token.
- `agent-session.repository` increments `tokenVersion`.

## Security-sensitive behavior

- Cookie wins over body token.
- Refresh token is never returned in JSON.
- Logout failures always return HTTP `200`.
- Normal logout operation order is revoke → clear cookie → increment tokenVersion.

## Tests

Characterization tests cover refresh rotation, cookie traits, old-token invalidation, body/cookie sources, invalid token mapping, and logout revocation. Unit tests assert controller operation ordering and fallback behavior.

## Known limitations or inconsistencies

Because routes have no auth middleware, `req.userInfo` is not normally populated by the route itself. The optional tokenVersion increment exists for callers that attach it earlier.

## Safe extension guidance

Before changing agent session behavior, verify cookie-first lookup, exact error mappings, logout `200` fallback, operation order, and refresh-token JSON omission.

## Verification references

- Base branch: `dev`
- Verified commit: `17175676a11842f66fb28c96e4bf54bb37a0d262`
- Mount: `routes/indexRoute.js`
- Routes: `routes/authRoutes/agentAuthRoutes.js`
- Entry point: `src/modules/agent/auth/session/index.js`
- Implementation:
  - `src/modules/agent/auth/session/agent-session.controller.js`
  - `src/modules/agent/auth/session/agent-session.service.js`
  - `src/modules/agent/auth/session/agent-session.repository.js`
  - `src/modules/agent/auth/session/agent-session.errors.js`
- Middleware:
  - None at route level
- Models/utilities inspected:
  - `models/userModel.js`
  - `models/refreshTokenModel.js`
  - `utils/tokenService.js`
- Characterization tests inspected:
  - `tests/characterization/agent-session-refresh.test.js`
  - `tests/characterization/agent-session-logout.test.js`
- Unit tests inspected:
  - `tests/unit/agent/agent-session-controller.test.js`
  - `tests/unit/agent/agent-session-controller-logout.test.js`
  - `tests/unit/agent/agent-session-service.test.js`
  - `tests/unit/agent/agent-session-repository.test.js`
  - `tests/unit/agent/agent-session-errors.test.js`
- Validation command: `npm run test:agent-session`
