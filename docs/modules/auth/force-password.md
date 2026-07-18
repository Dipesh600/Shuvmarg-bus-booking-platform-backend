# Force password

[Back to general authentication](README.md)

Related: [login](login.md) and [account activation](account-activation.md).

## Purpose

Force password completes the mandatory password replacement for a user who successfully authenticated but has `forcePasswordChange` set.

## Who uses it

Clients that received a `FORCE_PASSWORD_CHANGE` temp token from general login.

## Responsibilities

- Verify the temporary JWT purpose.
- Validate the new password.
- Optionally verify an `ACCOUNT_ACTIVATION` OTP when both `phone` and `otp` are supplied.
- Replace password, clear `forcePasswordChange`, mark phone verified, revoke sessions, increment `tokenVersion`, and issue new tokens.

## What this module does not do

- It does not activate invited accounts; see [account activation](account-activation.md).
- It does not verify current password; see [update password](update-password.md).
- It does not handle forgotten passwords; see [password reset](password-reset.md).

## Public endpoints

| Method | Full path | Middleware in order | Handler |
|---|---|---|---|
| POST | `/api/changeForcePassword` | None at route level | `forcePasswordModule.changeForcePassword` |

## Request and response walkthrough

The controller reads `tempToken`, `newPassword`, `phone`, and `otp`, plus device/IP metadata. Missing `tempToken` or `newPassword` returns `400`. JWT verification uses `process.env.SECRET_KEY`; invalid or expired tokens return `401`. The decoded purpose must equal `FORCE_PASSWORD_CHANGE`.

Password validation happens before optional OTP. OTP is verified only when both `phone` and `otp` are truthy, using purpose `ACCOUNT_ACTIVATION`; phone-only and OTP-only inputs are ignored. The user is loaded by `decoded.id` with `+password`. If `forcePasswordChange` is not truthy, the endpoint returns `400`.

Success hashes with cost `12`, saves password/flags, revokes refresh tokens, increments `tokenVersion`, fetches a fresh user, generates a token pair, removes only `password`, sets cookie if refresh token exists, and returns `accessToken`.

## Flow walkthrough

1. Require temp token and new password.
2. Verify JWT and purpose.
3. Validate password.
4. Optionally verify `ACCOUNT_ACTIVATION` OTP.
5. Load user with password.
6. Require `forcePasswordChange`.
7. Hash and save password plus flags.
8. Revoke tokens, increment `tokenVersion`, refetch user.
9. Generate tokens and return sanitized user.

## Authentication or ownership proof

The primary proof is the `FORCE_PASSWORD_CHANGE` temp token. OTP is optional unless both `phone` and `otp` are supplied.

## Data read and changed

| Model/document | Reads | Changes |
|---|---|---|
| `User` | `decoded.id`, `password`, `forcePasswordChange` | Sets `password`, `forcePasswordChange=false`, `phoneVerified=true`; increments `tokenVersion`; fresh lookup for response. |
| `OTP` | Optional `ACCOUNT_ACTIVATION` verification | May consume OTP through `otpHelper.verifyOTPCode` default behavior. |
| `RefreshToken` | None directly | Deletes all refresh tokens via `revokeAllUserTokens`. |

## Dependencies

- `jsonwebtoken` verifies temp token.
- `passwordValidator` validates new password.
- `otpHelper` optionally verifies activation OTP.
- `bcryptjs` hashes with cost `12`.
- `tokenService` revokes existing tokens and generates a new pair.

## Security-sensitive behavior

- Full service orchestration maps unexpected failures to `500 Internal Server Error`.
- Expected `AppError`s pass through unchanged.
- Refresh token is cookie-only and omitted from JSON.
- Optional OTP behavior is a current contract; do not make OTP mandatory without changing tests and docs.

## Tests

Characterization tests cover error contracts, success behavior, optional OTP, token/cookie behavior, and stored password/flag effects. Unit tests cover controller forwarding, service order, and failure mapping.

## Known limitations or inconsistencies

OTP is optional: when both `phone` and `otp` are absent, the flow proceeds after temp-token and password validation. Phone-only or OTP-only input also does not trigger verification.

## Safe extension guidance

Before changing this flow, verify login temp-token creation, OTP optionality, save/revoke/increment/generate order, cookie-only refresh token behavior, and response shape.

## Verification references

- Base branch: `dev`
- Verified commit: `17175676a11842f66fb28c96e4bf54bb37a0d262`
- Mount: `routes/indexRoute.js`
- Routes: `routes/userRoutes/userRoutes.js`
- Entry point: `src/modules/auth/force-password/index.js`
- Implementation:
  - `src/modules/auth/force-password/force-password.controller.js`
  - `src/modules/auth/force-password/force-password.service.js`
  - `src/modules/auth/force-password/force-password.repository.js`
  - `src/modules/auth/force-password/force-password.policy.js`
  - `src/modules/auth/force-password/force-password.errors.js`
  - `src/modules/auth/login/login.service.js`
- Middleware:
  - None at route level
- Models/utilities inspected:
  - `models/userModel.js`
  - `models/otpModel.js`
  - `models/refreshTokenModel.js`
  - `utils/otpHelper.js`
  - `utils/passwordValidator.js`
  - `utils/tokenService.js`
- Characterization tests inspected:
  - `tests/characterization/auth-force-password-errors.test.js`
  - `tests/characterization/auth-force-password-success.test.js`
- Unit tests inspected:
  - `tests/unit/auth/force-password-controller.test.js`
  - `tests/unit/auth/force-password-service.test.js`
  - `tests/unit/auth/force-password-order.test.js`
  - `tests/unit/auth/force-password-failures.test.js`
- Validation command: `npm run test:force-password`
