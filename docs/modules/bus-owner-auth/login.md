# Bus-owner login

[Back to bus-owner authentication](README.md)

## Purpose

This module owns login for the bus-owner web portal. It authenticates a `User`
with the `busOwner` role, enforces the current legacy account-state checks, and
issues a bus-owner scoped session.

## Who uses it

The current route supports bus-owner clients calling
`POST /api/auth/busowner/login`.

## Public endpoint

| Method | Full path | Middleware in order | Handler |
|---|---|---|---|
| POST | `/api/auth/busowner/login` | `loginRateLimiter` | `busOwnerLogin.login` |

The route has no JWT middleware. The limiter is the route-local
`loginRateLimiter` in `routes/authRoutes/busOwnerAuthRoutes.js`.

## Request and response walkthrough

The controller reads `password` from `req.body.password`. It reads the phone
identifier as `req.body.phone || req.body.emailOrPhone`, so a truthy `phone`
wins over `emailOrPhone`. `emailOrPhone` remains a phone fallback only; the
repository does not perform email login.

The service normalizes the chosen raw phone with `phoneGuard.normalizePhone`.
Missing phone returns `400` with `Phone number is required.` Missing password
returns `400` with `Password is required.`

The repository looks up `User.findOne({ $or: [{ phone: normalizedPhone },
{ phone: rawPhone }], deletedAt: null })` and selects:
`+password failedLoginAttempts lockedUntil status roles role forcePasswordChange
suspensionReason suspendedAt`.

On normal success, the endpoint returns `200`:

```json
{
  "success": true,
  "message": "Login successful.",
  "user": {},
  "accessToken": "<access-token>",
  "activeRole": "busOwner"
}
```

The actual `user` object is `user.toObject()` with only `password` deleted. The
refresh token is not returned in JSON. When token generation returns a refresh
token, the controller sets `refreshToken` as an HTTP-only cookie with:
`secure: process.env.NODE_ENV === "production"`, `sameSite: "Lax"`, and
`maxAge: 7 * 24 * 60 * 60 * 1000`.

Metadata passed to token generation is collected by the controller:
`deviceInfo` is `req.get("User-Agent") || null`; `ipAddress` is
`req.ip || req.socket?.remoteAddress || null`. The service adds
`activeRole: "busOwner"`.

## Flow walkthrough

1. Require a phone identifier.
2. Require a password.
3. Normalize the phone.
4. Look up the `User` by normalized phone or raw phone, excluding
   `deletedAt` users.
5. Reject missing users with the generic invalid-credentials response.
6. Check account state in this order: deleted-account branch, active lock,
   banned status, inactive status, bus-owner role requirement.
7. Compare the submitted password with `bcrypt.compare`.
8. On an invalid password, increment `failedLoginAttempts` with a separate
   `$inc` update, optionally set `lockedUntil` in a second update, then return
   the legacy attempts or lock message.
9. On a valid password with `forcePasswordChange`, sign a temporary JWT with
   purpose `FORCE_PASSWORD_CHANGE` and return it without resetting counters,
   generating a token pair, or setting a refresh cookie.
10. On a normal valid password, reset `failedLoginAttempts`, `lockedUntil`, and
    `lastLoginAt` before generating the token pair.
11. Convert the user to an object, delete `password`, return the access token,
    and set the refresh-token cookie when present.

Unexpected errors from service work, user conversion, cookie creation, or
response construction are mapped by the controller to `500`:
`{ "success": false, "message": "Login failed. Please try again." }`.

## Authentication or ownership proof

The proof is the current password for a user whose resolved roles include
`busOwner`. Roles are resolved from `user.roles` when it is non-empty;
otherwise the legacy `user.role` field is used.

## Data read and changed

| Model/document | Reads | Changes |
|---|---|---|
| `User` | `phone`, `password`, `failedLoginAttempts`, `lockedUntil`, `status`, `roles`, `role`, `forcePasswordChange`, `suspensionReason`, `suspendedAt`, `deletedAt` | Invalid password increments `failedLoginAttempts`; fifth or later failure sets `lockedUntil`; successful normal login sets `failedLoginAttempts: 0`, `lockedUntil: null`, and `lastLoginAt: new Date()` |
| Refresh-token storage | Used through `tokenService.generateTokenPair` | A refresh token record is created by the token service on successful normal login |

The login module does not import or query a BusOwner profile model and does not
check a profile `verificationStatus`.

## Dependencies and responsibilities

- Controller: HTTP field extraction, metadata collection, refresh-token cookie,
  response forwarding, generic login failure mapping.
- Service: validation order, account checks, password comparison,
  force-password branch, failed-attempt handling, token generation, public user
  response construction.
- Repository: exact `User` lookup and update queries.
- Policy: role fallback, lock detection, lock-minute calculation, status
  messages, remaining-attempt calculation, lock threshold.
- Errors: expected `AppError` response contracts.
- Utilities: `phoneGuard.normalizePhone`, `bcrypt.compare`, `jsonwebtoken.sign`,
  and `tokenService.generateTokenPair`.

## Security-sensitive behavior

- `phone` takes precedence over `emailOrPhone`; `emailOrPhone` is not email
  authentication.
- Account-state checks occur before password comparison.
- Invalid-password increment and lock are separate database updates.
- The lock threshold is `5`; lock duration is `15 * 60 * 1000`.
- Force-password login issues only a temporary token and no normal token pair.
- Normal login resets counters before token generation.
- The refresh token is cookie-only and uses the exact cookie options above.
- The module intentionally does not check BusOwner profile verification status.

## Tests

Characterization tests:

- `tests/characterization/bus-owner-login-validation.test.js` protects request
  field precedence, missing-field responses, unknown accounts, and no-body
  generic failure.
- `tests/characterization/bus-owner-login-account-state.test.js` protects lock,
  banned, inactive, role fallback, role precedence, and soft-delete behavior.
- `tests/characterization/bus-owner-login-attempts.test.js` protects failed
  attempt increments, lock message, no token on failure, and success reset.
- `tests/characterization/bus-owner-login-success.test.js` protects force
  password and normal successful login token/cookie behavior.

Unit tests:

- `tests/unit/bus-owner/bus-owner-login-controller.test.js`
- `tests/unit/bus-owner/bus-owner-login-service.test.js`
- `tests/unit/bus-owner/bus-owner-login-repository.test.js`
- `tests/unit/bus-owner/bus-owner-login-policy.test.js`
- `tests/unit/bus-owner/bus-owner-login-errors.test.js`

Run them with `npm run test:bus-owner-login`.

## Known limitations or inconsistencies

- The request field name `emailOrPhone` is accepted, but the implementation
  still performs phone lookup only.
- A non-empty `roles` array wins over the legacy `role` field, even when
  `role` is `busOwner`.
- The module does not check BusOwner profile verification status.

## Safe extension guidance

Before changing this module, verify route middleware order, the exact user
lookup projection, account-check order, failed-attempt update separation,
force-password restrictions, cookie options, and the response fields. Update
this document and the bus-owner login tests in the same pull request when any
of those contracts change.

## Verification references

- Base branch: `dev`
- Verified commit: `refactor/bus-owner-login` working tree after review fixes
- Mount: `routes/indexRoute.js`
- Routes: `routes/authRoutes/busOwnerAuthRoutes.js`
- Entry point: `src/modules/bus-owner/auth/login/index.js`
- Implementation:
  - `src/modules/bus-owner/auth/login/bus-owner-login.controller.js`
  - `src/modules/bus-owner/auth/login/bus-owner-login.service.js`
  - `src/modules/bus-owner/auth/login/bus-owner-login.repository.js`
  - `src/modules/bus-owner/auth/login/bus-owner-login.policy.js`
  - `src/modules/bus-owner/auth/login/bus-owner-login.errors.js`
- Middleware inspected:
  - `routes/authRoutes/busOwnerAuthRoutes.js` (`loginRateLimiter`)
- Models/utilities inspected:
  - `models/userModel.js`
  - `utils/phoneGuard.js`
  - `utils/tokenService.js`
  - `jsonwebtoken`
  - `bcryptjs`
- Characterization tests inspected:
  - `tests/characterization/bus-owner-login-validation.test.js`
  - `tests/characterization/bus-owner-login-account-state.test.js`
  - `tests/characterization/bus-owner-login-attempts.test.js`
  - `tests/characterization/bus-owner-login-success.test.js`
- Unit tests inspected:
  - `tests/unit/bus-owner/bus-owner-login-controller.test.js`
  - `tests/unit/bus-owner/bus-owner-login-service.test.js`
  - `tests/unit/bus-owner/bus-owner-login-repository.test.js`
  - `tests/unit/bus-owner/bus-owner-login-policy.test.js`
  - `tests/unit/bus-owner/bus-owner-login-errors.test.js`
- Validation command: `npm run test:bus-owner-login`
