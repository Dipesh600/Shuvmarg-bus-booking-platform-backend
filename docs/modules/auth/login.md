# Login

[Back to general authentication](README.md)

## Purpose

General login authenticates a user by email or phone and password, applies account-state checks, resolves an active role, and issues access plus refresh tokens.

## Who uses it

Unauthenticated general clients under `/api/login`, including passenger and multi-role user sessions.

## Responsibilities

- Validate login identifier and password presence.
- Load user with password selected.
- Enforce account-state checks.
- Track failed attempts and lock accounts after five failures.
- Return force-password temp tokens when required.
- Issue normal token pairs and refresh-token cookie on successful login.

## What this module does not do

- It does not perform agent-specific phone-only login; see [agent login](../agent-auth/login.md).
- It does not change passwords; see [update password](update-password.md), [password reset](password-reset.md), and [force password](force-password.md).

## Public endpoints

| Method | Full path | Middleware in order | Handler |
|---|---|---|---|
| POST | `/api/login` | `loginLimiter` | `loginModule.login` |

## Request and response walkthrough

The controller reads `emailOrPhone`, `password`, `X-App-Source`, `User-Agent`, and IP. Missing `emailOrPhone` or `password` returns `400`. The repository queries `User.findOne({ $or: [{ email }, { phone }] }).select("+password")`.

Unknown account returns `401 Invalid credentials!`. Deleted, locked, banned, inactive, and invited states are checked before password comparison. Wrong password increments `failedLoginAttempts`; count `>= 5` sets `lockedUntil` 15 minutes ahead and returns `401`.

If `forcePasswordChange` is true after a valid password, the response is `200` with `forcePasswordChange: true` and a `tempToken` with purpose `FORCE_PASSWORD_CHANGE`; no normal tokens or cookie are issued. Otherwise the module resets failed attempts/lock state, updates `lastLoginAt`, generates tokens, sets `refreshToken` cookie, removes `password` from JSON, and returns `accessToken` plus `activeRole`.

## Flow walkthrough

1. Validate identifier and password.
2. Find user by exact email or phone.
3. Check deleted, active lock, banned, inactive, and invited states.
4. Compare password with bcrypt.
5. On failure, increment failed attempts and optionally lock.
6. On force-password, sign a 15-minute temporary JWT.
7. Resolve active role from lowercased `X-App-Source`.
8. Reset counters and issue token pair.

## Authentication or ownership proof

The proof is the current password for the matched email or phone.

## Data read and changed

| Model/document | Reads | Changes |
|---|---|---|
| `User` | `email`, `phone`, `password`, `deletedAt`, `lockedUntil`, `status`, `roles`, `role`, `forcePasswordChange`, `tokenVersion` | Wrong password increments `failedLoginAttempts`; fifth failure sets `lockedUntil`; success clears `failedLoginAttempts` and `lockedUntil`, updates `lastLoginAt`, and may backfill `roles` from `role`. |
| `RefreshToken` | None directly | `tokenService.generateTokenPair` creates a refresh-token record. |

## Dependencies

- `bcryptjs` compares passwords.
- `jsonwebtoken` signs force-password temp tokens.
- `tokenService.generateTokenPair` issues access/refresh tokens.
- `login.policy` owns account status and active-role resolution.

## Security-sensitive behavior

- Account-state checks happen before password comparison.
- Failed-attempt count returned from the update controls lock behavior.
- Force-password returns a temporary token and stops before normal token generation.
- Refresh token is cookie-only.

## Tests

Characterization tests cover validation, failed-attempt tracking, lockout, account states, role selection, force-password, cookie behavior, and successful reset effects. Unit tests cover service error mapping.

## Known limitations or inconsistencies

`X-App-Source` is lowercased in the controller, but `VALID_APP_SOURCES` contains `busOwner` with uppercase `O`; the current code therefore falls back to the primary role for `busOwner` input instead of matching that source. This is documented in `src/modules/auth/login/login.policy.js` and characterized in `tests/characterization/auth-login-roles.test.js`.

## Safe extension guidance

Verify account-check order, failed-attempt updates, force-password branching, active-role behavior, and refresh-token cookie-only behavior before changing login.

## Verification references

- Base branch: `dev`
- Verified commit: `17175676a11842f66fb28c96e4bf54bb37a0d262`
- Mount: `routes/indexRoute.js`
- Routes: `routes/userRoutes/userRoutes.js`
- Entry point: `src/modules/auth/login/index.js`
- Implementation:
  - `src/modules/auth/login/login.controller.js`
  - `src/modules/auth/login/login.service.js`
  - `src/modules/auth/login/login.repository.js`
  - `src/modules/auth/login/login.policy.js`
  - `src/modules/auth/login/login.mapper.js`
- Middleware:
  - `loginLimiter` in `routes/userRoutes/userRoutes.js`
- Models/utilities inspected:
  - `models/userModel.js`
  - `models/refreshTokenModel.js`
  - `utils/tokenService.js`
- Characterization tests inspected:
  - `tests/characterization/auth-login.test.js`
  - `tests/characterization/auth-login-security.test.js`
  - `tests/characterization/auth-login-roles.test.js`
- Unit tests inspected:
  - `tests/unit/auth/login-service.test.js`
- Validation command: `npm run test:auth`
