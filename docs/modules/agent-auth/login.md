# Agent login

[Back to agent authentication](README.md)

Related: [agent password reset](password-reset.md).

## Purpose

Agent login authenticates an agent by phone/password, enforces agent-specific account checks, and issues an agent-scoped session.

## Who uses it

Unauthenticated agent portal clients calling `/api/auth/agent/login`.

## Responsibilities

- Resolve raw phone from `phone` first, then `emailOrPhone`.
- Normalize phone and look up a non-deleted user by normalized or raw phone.
- Enforce agent-role and account-state checks.
- Track failed login attempts and lock after five attempts.
- Return force-password temp token when needed.
- Reset login security state and issue agent tokens on success.

## What this module does not do

- It does not authenticate by email.
- It does not check Agent application status.
- It does not handle refresh/logout; see [agent session](session.md).

## Public endpoints

| Method | Full path | Middleware in order | Handler |
|---|---|---|---|
| POST | `/api/auth/agent/login` | `loginRateLimiter` | `agentLogin.login` |

## Request and response walkthrough

The controller reads `password` and `rawPhone = req.body.phone || req.body.emailOrPhone`. A truthy `phone` wins over `emailOrPhone`; an empty `phone` falls through. Missing phone returns `400 Phone number is required.` Missing password returns `400 Password is required.`

The repository queries `User.findOne({ $or: [{ phone: normalizedPhone }, { phone: rawPhone }], deletedAt: null })` with selection `+password failedLoginAttempts lockedUntil status roles role forcePasswordChange suspensionReason suspendedAt`. No email lookup is added.

The service checks deleted account branch after lookup, active lock, banned, inactive, agent role, then password. Because the query filters `deletedAt: null`, soft-deleted matching users normally return the generic invalid-credentials response. Wrong password increments failed attempts; count `>= 5` performs a second lock update.

Valid password with `forcePasswordChange` returns a 15-minute temp token and no normal token pair. Normal success resets failed attempts/lock/lastLoginAt before generating tokens with `activeRole: "agent"`, sets the refresh-token cookie, removes `password`, and returns `accessToken`.

## Flow walkthrough

1. Require phone then password.
2. Normalize phone and query by normalized/raw phone with `deletedAt: null`.
3. Check account states and agent role.
4. Compare password.
5. Wrong password: increment count, optionally lock in a second update, return `401`.
6. Force-password: sign temp token and stop.
7. Success: reset login security state, generate token pair, sanitize user, return.

## Authentication or ownership proof

The proof is the current password for a user that has the `agent` role.

## Data read and changed

| Model/document | Reads | Changes |
|---|---|---|
| `User` | `phone`, `password`, `failedLoginAttempts`, `lockedUntil`, `status`, `roles`, `role`, `forcePasswordChange`, `suspensionReason`, `suspendedAt` | Wrong password increments `failedLoginAttempts`; threshold sets `lockedUntil`; success sets `failedLoginAttempts=0`, `lockedUntil=null`, `lastLoginAt=Date`. |
| `RefreshToken` | None directly | Created by `generateTokenPair` with `activeRole: "agent"`. |

## Dependencies

- `phoneGuard.normalizePhone` normalizes the raw phone.
- `bcryptjs` compares passwords.
- `jsonwebtoken` creates `FORCE_PASSWORD_CHANGE` temp tokens.
- `tokenService.generateTokenPair` issues agent access/refresh tokens.

## Security-sensitive behavior

- `loginRateLimiter` remains first middleware.
- Role checks happen before password comparison.
- Attempt increment and lock are separate database updates.
- Force-password branch issues no normal token pair.
- Refresh token is cookie-only.

## Tests

Characterization tests cover validation, account states, failed attempts, lockout, force-password, success, cookie behavior, and agent refresh integration. Unit tests cover controller extraction, service order, repository queries, policy, and errors.

## Known limitations or inconsistencies

The `emailOrPhone` fallback is still treated as a phone; there is no email lookup. The repository excludes soft-deleted users before the deleted-account error branch can normally run for route requests.

## Safe extension guidance

Before modifying agent login, verify phone precedence, exact lookup projection, account-check order, failed-attempt update split, force-password no-token behavior, activeRole `agent`, and cookie-only refresh token.

## Verification references

- Base branch: `dev`
- Verified commit: `17175676a11842f66fb28c96e4bf54bb37a0d262`
- Mount: `routes/indexRoute.js`
- Routes: `routes/authRoutes/agentAuthRoutes.js`
- Entry point: `src/modules/agent/auth/login/index.js`
- Implementation:
  - `src/modules/agent/auth/login/agent-login.controller.js`
  - `src/modules/agent/auth/login/agent-login.service.js`
  - `src/modules/agent/auth/login/agent-login.repository.js`
  - `src/modules/agent/auth/login/agent-login.policy.js`
  - `src/modules/agent/auth/login/agent-login.errors.js`
- Middleware:
  - `loginRateLimiter` in `routes/authRoutes/agentAuthRoutes.js`
- Models/utilities inspected:
  - `models/userModel.js`
  - `models/refreshTokenModel.js`
  - `utils/phoneGuard.js`
  - `utils/tokenService.js`
- Characterization tests inspected:
  - `tests/characterization/agent-login-validation.test.js`
  - `tests/characterization/agent-login-account-state.test.js`
  - `tests/characterization/agent-login-attempts.test.js`
  - `tests/characterization/agent-login-success.test.js`
- Unit tests inspected:
  - `tests/unit/agent/agent-login-controller.test.js`
  - `tests/unit/agent/agent-login-service.test.js`
  - `tests/unit/agent/agent-login-repository.test.js`
  - `tests/unit/agent/agent-login-policy.test.js`
  - `tests/unit/agent/agent-login-errors.test.js`
- Validation command: `npm run test:agent-login`
