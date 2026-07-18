# Bus-owner session

[Back to bus-owner authentication](README.md)

## Purpose

The bus-owner session module rotates bus-owner refresh tokens and logs out the current device for the bus-owner portal. It exists to remove refresh/logout behavior from the legacy bus-owner authentication controller without changing the public contract.

## Who uses it

Bus-owner clients using `/api/auth/busowner/refresh` and `/api/auth/busowner/logout`. The routes have no route-level JWT middleware.

## Responsibilities

- Read refresh tokens from cookie first, then request body.
- Rotate refresh tokens through `tokenService.rotateRefreshToken`.
- Revoke exactly one refresh token on logout.
- Clear or replace the `refreshToken` cookie with the legacy options.
- Optionally increment `User.tokenVersion` on logout when `req.userInfo?.id` exists.

## What this module does not do

- It does not perform bus-owner login, registration, or password reset; those remain legacy controller-backed.
- It does not revoke all sessions on logout.
- It does not authenticate the logout route with access-token middleware.
- It does not expose refresh tokens in JSON responses.

## Public endpoints

| Method | Full path | Middleware in order | Handler |
|---|---|---|---|
| POST | `/api/auth/busowner/refresh` | None at route level | `busOwnerSession.refresh` |
| POST | `/api/auth/busowner/logout` | None at route level | `busOwnerSession.logout` |

## Request and response walkthrough

`refresh` reads `refreshToken` from `req.cookies.refreshToken` first, then `req.body.refreshToken`. Missing token returns `401` with `Session expired. Please sign in again.`. Rotation receives `deviceInfo` from `req.headers["user-agent"] || null` and `ipAddress` from `req.ip || null`; there is no socket or connection fallback. Success sets a new `refreshToken` cookie only when rotation returns one, then returns `200` with `success`, message, and `accessToken`. The new refresh token is cookie-only.

Refresh maps `INVALID_REFRESH_TOKEN` and `REFRESH_TOKEN_EXPIRED` to the same session-expired `401`, maps `ACCOUNT_BANNED` and `ROLE_REVOKED` to `403`, and maps all other refresh errors to `401` with `Session could not be renewed. Please sign in again.`.

`logout` reads the refresh token from cookie first, then body. If present, it revokes only that token. It clears the `refreshToken` cookie, then reads `req.userInfo?.id`; if present, it increments `User.tokenVersion`. Normal success returns `200` with `Logged out successfully.`. If the normal flow throws, the catch logs, clears the cookie again, and returns the same success body.

## Flow walkthrough

Refresh:

1. Extract refresh token, cookie first.
2. Reject missing token.
3. Rotate the token with user-agent and IP metadata.
4. Set the replacement cookie when a new refresh token exists.
5. Return the access token in JSON.

Logout:

1. Extract refresh token, cookie first.
2. Revoke that one token when present.
3. Clear the refresh-token cookie.
4. Read optional `req.userInfo?.id`.
5. Increment `tokenVersion` only when the optional user ID exists.
6. Return success.

## Authentication or ownership proof

Refresh-token possession is the proof for refresh and logout. Logout has no access-token middleware, so normal route requests usually do not have `req.userInfo`; the tokenVersion increment is optional.

## Data read and changed

| Model/document | Reads | Changes |
|---|---|---|
| `RefreshToken` | Token hash, expiry, active role and user ID through `tokenService` | Refresh deletes the old token and creates a new one. Logout deletes one matching token. |
| `User` | Loaded by `tokenService.rotateRefreshToken` for refresh-token validation | Logout may increment `tokenVersion` by one only when `req.userInfo?.id` exists. |

## Dependencies

- `tokenService.rotateRefreshToken` validates, rotates and preserves the stored active role.
- `tokenService.revokeRefreshToken` deletes one refresh-token record.
- `bus-owner-session.repository` performs the exact optional `User.findByIdAndUpdate` tokenVersion increment.
- `AppError`, `asyncHandler`, and `respond` preserve the modular HTTP pattern.

## Security-sensitive behavior

- Cookie token wins over body token.
- Unknown refresh failures return `401`, not `500`.
- `refreshToken` is never returned in JSON.
- Cookie options keep `httpOnly`, production-only `secure`, `sameSite: "Lax"`, and seven-day `maxAge` for refresh.
- Logout clears the cookie without `maxAge`, `path`, or `domain`.
- Logout revokes one refresh token, not all sessions.
- Logout has no auth middleware, so tokenVersion normally does not increment.
- The catch-time second `clearCookie` is not wrapped in another try/catch; if that second clear throws, the error escapes the local handler.

## Tests

Characterization tests cover public route contracts for token source priority, cookie-only refresh tokens, rotation, logout revocation, optional tokenVersion behavior, and fallback logout behavior. Unit tests cover controller ordering, service token boundaries, repository query shape, and exact refresh error mappings.

## Known limitations or inconsistencies

Bus-owner logout returns `Logged out successfully.` on both normal and handled-error paths, unlike agent logout. The route has no auth middleware, so the optional tokenVersion increment usually does not run. Catch-time cookie clearing is not protected by a nested catch.

## Safe extension guidance

Before changing this module, verify route middleware absence, cookie-first lookup, refresh error statuses, cookie options, single-token revocation, optional tokenVersion behavior, and the exact test paths in `package.json`.

## Verification references

- Base branch: `dev`
- Verified commit: `73bd387aa0cc9f79154c6b6a24071f68be9b09bd`
- Mount: `routes/indexRoute.js`
- Routes: `routes/authRoutes/busOwnerAuthRoutes.js`
- Entry point: `src/modules/bus-owner/auth/session/index.js`
- Implementation:
  - `src/modules/bus-owner/auth/session/bus-owner-session.controller.js`
  - `src/modules/bus-owner/auth/session/bus-owner-session.service.js`
  - `src/modules/bus-owner/auth/session/bus-owner-session.repository.js`
  - `src/modules/bus-owner/auth/session/bus-owner-session.errors.js`
- Middleware inspected: none for these route entries
- Models/utilities inspected:
  - `models/userModel.js`
  - `models/refreshTokenModel.js`
  - `utils/tokenService.js`
- Characterization tests inspected:
  - `tests/characterization/bus-owner-session-refresh.test.js`
  - `tests/characterization/bus-owner-session-logout.test.js`
- Unit tests inspected:
  - `tests/unit/bus-owner/bus-owner-session-controller.test.js`
  - `tests/unit/bus-owner/bus-owner-session-controller-logout.test.js`
  - `tests/unit/bus-owner/bus-owner-session-service.test.js`
  - `tests/unit/bus-owner/bus-owner-session-repository.test.js`
  - `tests/unit/bus-owner/bus-owner-session-errors.test.js`
- Validation command: `npm run test:bus-owner-session`
