# Session

[Back to general authentication](README.md)

Related: [agent session](../agent-auth/session.md).

## Purpose

The session module refreshes access tokens through refresh-token rotation and logs users out by revoking refresh tokens.

## Who uses it

Clients holding a general refresh token from login, force-password completion, account activation, or another general token-issuing flow.

## Responsibilities

- Accept refresh tokens from cookie first, then request body.
- Rotate refresh tokens and return a new access token.
- Revoke a single refresh token during logout.
- Optionally increment `tokenVersion` when `req.userInfo?.id` is present.

## What this module does not do

- It does not require access-token middleware at route level.
- It does not use the agent-specific session error messages.

## Public endpoints

| Method | Full path | Middleware in order | Handler |
|---|---|---|---|
| POST | `/api/refresh` | None at route level | `sessionController.refreshAccessToken` |
| POST | `/api/logout` | None at route level | `sessionController.logout` |

## Request and response walkthrough

Both endpoints read `req.cookies?.refreshToken || req.body?.refreshToken`, so the cookie wins. Refresh requires a token; missing token returns `400 Refresh token is required.` It calls `tokenService.rotateRefreshToken` with `deviceInfo` and `ipAddress`, sets a replacement `refreshToken` cookie when present, and returns `200` with `accessToken` only.

Logout clears the cookie before calling `sessionService.logoutSession`. The service revokes the refresh token if present and increments `tokenVersion` if a user ID is present. Logout always returns `200 Logged out successfully.`

## Flow walkthrough

Refresh: extract token → require token → rotate token → set replacement cookie → return access token.

Logout: extract token/userId → clear cookie → revoke token if provided → increment `tokenVersion` if `userId` exists → return success.

## Authentication or ownership proof

Refresh and logout rely on possession of a refresh token. The routes have no access-token middleware.

## Data read and changed

| Model/document | Reads | Changes |
|---|---|---|
| `RefreshToken` | `tokenService.rotateRefreshToken` reads stored token hash and user session role | Refresh deletes the old refresh-token record and creates a new one; logout deletes one refresh-token record. |
| `User` | Refresh loads user inside `tokenService`; logout may use `userId` if present on request | Logout may increment `tokenVersion`; refresh checks user state and role through `tokenService`. |

## Dependencies

- `tokenService.rotateRefreshToken` validates and rotates refresh tokens.
- `tokenService.revokeRefreshToken` revokes one token.
- `session.repository.incrementTokenVersion` updates User token version.

## Security-sensitive behavior

- Refresh token is never returned in JSON.
- Cookie options are `httpOnly`, production-only `secure`, `SameSite=Lax`, and seven-day `maxAge`.
- Refresh error mapping differs from agent refresh.

## Tests

Characterization tests cover missing/invalid refresh tokens, rotation, role revocation, logout token revocation, body fallback, cookie precedence, and tokenVersion non-increment on ordinary unauthenticated logout. Unit tests cover service and controller behavior.

## Known limitations or inconsistencies

`/api/logout` has no auth middleware, so ordinary route calls do not populate `req.userInfo`; characterization confirms tokenVersion does not increment in that path.

## Safe extension guidance

Before changing session behavior, verify cookie precedence, refresh-token JSON omission, route middleware absence, error mappings, and `tokenVersion` behavior.

## Verification references

- Base branch: `dev`
- Verified commit: `17175676a11842f66fb28c96e4bf54bb37a0d262`
- Mount: `routes/indexRoute.js`
- Routes: `routes/userRoutes/userRoutes.js`
- Entry point: `src/modules/auth/session/index.js`
- Implementation:
  - `src/modules/auth/session/session.controller.js`
  - `src/modules/auth/session/session.service.js`
  - `src/modules/auth/session/session.repository.js`
  - `src/modules/auth/session/session.errors.js`
- Middleware:
  - None at route level
- Models/utilities inspected:
  - `models/userModel.js`
  - `models/refreshTokenModel.js`
  - `utils/tokenService.js`
- Characterization tests inspected:
  - `tests/characterization/auth-refresh.test.js`
  - `tests/characterization/auth-refresh-rotation.test.js`
  - `tests/characterization/auth-logout.test.js`
  - `tests/characterization/auth-logout-contract.test.js`
- Unit tests inspected:
  - `tests/unit/auth/session-controller.test.js`
  - `tests/unit/auth/session-service.test.js`
  - `tests/unit/auth/session-service-logout.test.js`
- Validation command: `npm run test:auth`
