# Password reset

[Back to general authentication](README.md)

Related: [update password](update-password.md), [force password](force-password.md), and [agent password reset](../agent-auth/password-reset.md).

## Purpose

Password reset lets a user recover an account through a password-reset OTP without an active session.

## Who uses it

Unauthenticated general clients using `/api/requestPasswordReset`, `/api/verifyOtpForReset`, and `/api/resetPassword`.

## Responsibilities

- Request a `PASSWORD_RESET` OTP through an enumeration-resistant response.
- Verify a reset OTP without consuming it.
- Consume the same reset OTP when setting a new password.
- Revoke existing refresh tokens and increment `tokenVersion` after password change.

## What this module does not do

- It does not change a password for an already-authenticated user; see [update password](update-password.md).
- It does not handle temporary-password replacement; see [force password](force-password.md).
- It does not handle agent reset contracts; see [agent password reset](../agent-auth/password-reset.md).

## Public endpoints

| Method | Full path | Middleware in order | Handler |
|---|---|---|---|
| POST | `/api/requestPasswordReset` | `otpRateLimiter` | `passwordResetModule.requestPasswordReset` |
| POST | `/api/verifyOtpForReset` | `otpVerifyLimiter` | `passwordResetModule.verifyOtpForReset` |
| POST | `/api/resetPassword` | `otpVerifyLimiter` | `passwordResetModule.resetPassword` |

## Request and response walkthrough

`requestPasswordReset` reads `emailOrPhone`. Missing input returns `400 Email or Phone is required!`. It normalizes phone input, looks up by email or phone, then runs OTP dispatch inside `withMinimumLatency(..., 600)`. Whether the account exists or not, the successful response is `200` with `If an account exists, OTP has been sent.`

`verifyOtpForReset` reads `emailOrPhone` and `otp`, strips non-digits, requires six digits, and calls `otpFirstVerify(..., "PASSWORD_RESET", false, verifyOTPCode, userLookup)`. It peeks at the OTP and does not consume it. Success returns `200 OTP verified. Proceed to reset password.`

`resetPassword` reads `emailOrPhone`, `otp`, and `newPassword`. It validates required fields, normalizes, sanitizes OTP, verifies and consumes OTP with `"PASSWORD_RESET"` and `true`, then loads an active user, validates password strength, hashes with bcrypt cost `12`, saves the new password, revokes all refresh tokens, increments `tokenVersion`, and returns success.

## Flow walkthrough

1. Request endpoint pads timing and sends OTP only when a user exists.
2. Verify endpoint checks OTP before user lookup using `enumGuard.otpFirstVerify`.
3. Reset endpoint consumes OTP before looking up the active user.
4. Password validation happens after successful OTP consumption.
5. Password save happens before refresh-token revocation.
6. Refresh-token revocation happens before `tokenVersion` increment.

## Authentication or ownership proof

The proof is possession of a valid `PASSWORD_RESET` OTP. The verify step is an OTP peek; the reset step consumes the OTP.

## Data read and changed

| Model/document | Reads | Changes |
|---|---|---|
| `User` | Lookup by email or phone; active reset lookup with `deletedAt: null`; password selected for reset | Saves new `password`; increments `tokenVersion`. |
| `OTP` | `PASSWORD_RESET` record | Created by request; peeked by verify; consumed by reset. |
| `RefreshToken` | None directly | `revokeAllUserTokens` deletes all refresh-token records for the user after password save. |

## Dependencies

- `phoneGuard.normalizePhone` preserves phone normalization.
- `enumGuard.withMinimumLatency` and `otpFirstVerify` provide anti-enumeration behavior.
- `otpHelper` sends and verifies OTPs.
- `passwordValidator` validates new password.
- `bcryptjs` hashes with cost `12`.
- `tokenService.revokeAllUserTokens` invalidates refresh sessions.

## Security-sensitive behavior

- Request responses are enumeration-resistant and padded to 600 ms.
- Verify uses OTP-first ordering and `markUsed=false`.
- Reset consumes OTP with `markUsed=true` before user lookup.
- No new tokens are issued after password reset.

## Tests

Characterization tests cover request anti-enumeration, email/phone behavior, OTP peek, reset errors, successful reset, token revocation, and tokenVersion increment. Unit tests cover service ordering and failure mapping.

## Known limitations or inconsistencies

The verify service comments and tests document a current email-flow defect: request sends the OTP to `user.phone`, while verify normalizes the email and can look for the OTP under the email-derived lookup key. The behavior is preserved.

## Safe extension guidance

Do not change OTP peek/consume split, timing padding, password-save ordering, or response shapes without updating characterization tests and this page.

## Verification references

- Base branch: `dev`
- Verified commit: `17175676a11842f66fb28c96e4bf54bb37a0d262`
- Mount: `routes/indexRoute.js`
- Routes: `routes/userRoutes/userRoutes.js`
- Entry point: `src/modules/auth/password-reset/index.js`
- Implementation:
  - `src/modules/auth/password-reset/password-reset.controller.js`
  - `src/modules/auth/password-reset/request-password-reset.service.js`
  - `src/modules/auth/password-reset/verify-reset-otp.service.js`
  - `src/modules/auth/password-reset/reset-password.service.js`
  - `src/modules/auth/password-reset/password-reset.repository.js`
  - `src/modules/auth/password-reset/password-reset.policy.js`
  - `src/modules/auth/password-reset/password-reset.errors.js`
- Middleware:
  - `middleware/otpRateLimiter.js`
- Models/utilities inspected:
  - `models/userModel.js`
  - `models/otpModel.js`
  - `models/refreshTokenModel.js`
  - `utils/enumGuard.js`
  - `utils/otpHelper.js`
  - `utils/phoneGuard.js`
  - `utils/passwordValidator.js`
  - `utils/tokenService.js`
- Characterization tests inspected:
  - `tests/characterization/auth-password-reset-request.test.js`
  - `tests/characterization/auth-password-reset-verify.test.js`
  - `tests/characterization/auth-password-reset-complete-errors.test.js`
  - `tests/characterization/auth-password-reset-complete-success.test.js`
- Unit tests inspected:
  - `tests/unit/auth/request-password-reset-service.test.js`
  - `tests/unit/auth/verify-reset-otp-service.test.js`
  - `tests/unit/auth/reset-password-service.test.js`
  - `tests/unit/auth/reset-password-failure-order.test.js`
  - `tests/unit/auth/password-reset-controller.test.js`
- Validation command: `npm run test:password-reset`
