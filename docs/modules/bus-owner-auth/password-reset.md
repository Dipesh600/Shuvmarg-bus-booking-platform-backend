# Bus-owner password reset

[Back to bus-owner authentication](README.md)

## Purpose

This module owns forgotten-password recovery for bus-owner accounts. It extracts the remaining password-reset endpoints from the legacy bus-owner auth controller while preserving the current API contract.

## Who uses it

Bus-owner clients using `/api/auth/busowner` password-reset endpoints. These routes are public at route level and rely on OTP possession rather than an access token.

## Responsibilities

- Request and resend password-reset OTPs with purpose `BUSOWNER_PASSWORD_RESET`.
- Verify reset OTPs without consuming them.
- Complete password reset by consuming the OTP, changing the password, revoking refresh tokens, and incrementing `tokenVersion`.
- Preserve enumeration-resistant responses and endpoint-specific fallback responses.

## What this module does not do

- It does not handle registration, login, refresh, or logout.
- It does not check the `BusOwner` profile or `verificationStatus`.
- It does not issue replacement access or refresh tokens after reset.
- It does not set or clear cookies.

## Public endpoints

| Method | Full path | Middleware in order | Handler |
|---|---|---|---|
| POST | `/api/auth/busowner/requestPasswordReset` | `otpRateLimiter` | `busOwnerPasswordReset.requestPasswordReset` |
| POST | `/api/auth/busowner/verifyOtpForReset` | `otpVerifyLimiter` | `busOwnerPasswordReset.verifyOtpForReset` |
| POST | `/api/auth/busowner/resetPassword` | `otpVerifyLimiter` | `busOwnerPasswordReset.resetPassword` |
| POST | `/api/auth/busowner/resendOtpForReset` | `otpRateLimiter` | `busOwnerPasswordReset.resendOtpForReset` |

## Request and response walkthrough

`requestPasswordReset` reads `phone`, normalizes it with `phoneGuard.normalizePhone`, and returns `400` with `Phone number is required.` when missing. The lookup, role check, and optional OTP send run inside `withMinimumLatency(..., 600)`. Missing accounts, non-bus-owner accounts, and eligible bus owners all receive `200` with `If an account exists, OTP has been sent.`. The request endpoint does not explicitly block banned or inactive bus-owner users before OTP dispatch. `OTP_SEND_BLOCKED` maps to `429`; errors containing `Sparrow SMS` map to `502`; other unexpected errors map to `500`.

`verifyOtpForReset` reads `phone` and `otp`, returns `400` with `Phone and OTP are required!` when either is missing, strips non-digits from the OTP, and requires six digits. It calls `otpFirstVerify(phone, cleanOtp, "BUSOWNER_PASSWORD_RESET", false, verifyOTPCode, userLookup)`, so the OTP is peeked, not consumed. A missing user, invalid OTP, or non-bus-owner role all use the generic invalid/expired verification response. Success returns only `success` and `OTP verified. Proceed to reset password.`.

`resetPassword` reads `phone`, `otp`, and `newPassword`, sanitizes the OTP, looks up `User.findOne({ phone })`, checks the bus-owner role, then consumes the OTP with `verifyOTPCode(user.phone, cleanOtp, "BUSOWNER_PASSWORD_RESET", true)`. Password validation happens after OTP consumption and returns `passValidation.message` on failure. The password is hashed with `bcrypt.genSalt(10)` followed by `bcrypt.hash(newPassword, salt)`. Success returns `200` with `Password reset successful! You can now login.` and no tokens or cookies.

`resendOtpForReset` normalizes `phone`, returns the neutral `200` for missing accounts and non-bus-owner accounts, checks banned or inactive status only after confirming the bus-owner role, and sends `BUSOWNER_PASSWORD_RESET` OTP to eligible users. Suspended bus owners receive `403` with `ACCOUNT_SUSPENDED`.

## Flow walkthrough

1. Request: normalize → require phone → minimum-latency wrapper → user lookup → bus-owner role check → optional OTP to stored `user.phone` → neutral response.
2. Verify: normalize → require phone/OTP → sanitize OTP → six-digit check → OTP-first peek with `consume=false` → role resolution → success.
3. Complete: normalize → require all fields → sanitize OTP → user lookup → role check → OTP consume with `consume=true` → password validation → salt/hash → mutate user → save → revoke all refresh tokens → increment `tokenVersion` → success.
4. Resend: normalize → require phone → user lookup → role check → suspended check → OTP to normalized request phone → response.

## Authentication or ownership proof

The proof is possession of a valid `BUSOWNER_PASSWORD_RESET` OTP. The verify endpoint only peeks at the OTP; the complete reset endpoint consumes it. The client must submit the OTP again to complete reset.

## Data read and changed

| Model/document | Reads | Changes |
|---|---|---|
| `User` | `phone`, `roles`, `role`, `status`, password/security fields | Complete reset changes `password`, may set `isVerified: true`, sets `failedLoginAttempts: 0`, `lockedUntil: null`, `forcePasswordChange: false`, and increments `tokenVersion` |
| OTP storage | Through `verifyOTPCode` and `otpFirstVerify` | Verify peeks with `consume=false`; complete reset consumes with `consume=true`; request/resend create reset OTPs |
| Refresh-token storage | Through `tokenService.revokeAllUserTokens` | Complete reset revokes all existing refresh tokens after saving the user |

## Dependencies

- `phoneGuard.normalizePhone` and `checkPhoneForRole` preserve phone normalization and multi-role checks.
- `enumGuard.withMinimumLatency` pads the request endpoint to 600 ms; `otpFirstVerify` preserves OTP-first ordering.
- `otpHelper.createAndSendOTP` and `verifyOTPCode` send, peek, and consume reset OTPs.
- `passwordValidator.validatePassword` validates the new password after OTP consumption.
- `bcryptjs` preserves the two-step `genSalt(10)` then `hash` sequence.
- `tokenService.revokeAllUserTokens` invalidates refresh-token records.
- `bus-owner-password-reset.repository` owns direct `User` queries, document save, and tokenVersion increment.

## Security-sensitive behavior

- OTP purpose remains exactly `BUSOWNER_PASSWORD_RESET`.
- Request responses are enumeration-resistant and minimum-latency padded.
- The request endpoint does not explicitly block suspended users before OTP send.
- Verify uses OTP-first ordering and `consume=false`.
- Complete reset consumes the OTP before password validation.
- Password hashing uses bcrypt cost `10` through separate salt and hash calls.
- Save happens before refresh-token revocation, and revocation happens before `tokenVersion` increment.
- The flow is non-transactional; password changes may persist if later revocation or increment fails.
- No replacement tokens are issued and no cookies are set.

## Tests

Characterization tests:

- `tests/characterization/bus-owner-password-reset-request.test.js`
- `tests/characterization/bus-owner-password-reset-verify.test.js`
- `tests/characterization/bus-owner-password-reset-complete.test.js`
- `tests/characterization/bus-owner-password-reset-resend.test.js`
- `tests/characterization/bus-owner-password-reset-errors.test.js`

Unit tests:

- `tests/unit/bus-owner/bus-owner-password-reset-controller.test.js`
- `tests/unit/bus-owner/bus-owner-password-reset-service.test.js`
- `tests/unit/bus-owner/bus-owner-password-reset-repository.test.js`
- `tests/unit/bus-owner/bus-owner-password-reset-policy.test.js`
- `tests/unit/bus-owner/bus-owner-password-reset-errors.test.js`

Run them with `npm run test:bus-owner-password-reset`.

## Known limitations or inconsistencies

- `requestPasswordReset` does not explicitly block banned or inactive bus-owner users before OTP dispatch, while `resendOtpForReset` does return a suspended-account `403` after confirming the bus-owner role.
- `resetPassword` consumes a valid OTP before validating password strength.
- Invalid password uses `passValidation.message`, while the shared validator normally exposes errors in an `errors` array.
- The flow is non-transactional and can leave partial writes when later token revocation or tokenVersion increment fails.

## Safe extension guidance

Before changing this module, verify route middleware order, OTP purpose, request minimum latency, OTP peek/consume flags, role fallback behavior, password-validation ordering, bcrypt sequence, user mutation fields, save/revoke/increment ordering, and exact endpoint-specific error bodies. Update this document and the bus-owner password-reset tests in the same pull request when those contracts change.

## Verification references

- Base branch: `dev`
- Verified source: `refactor/bus-owner-password-reset` working tree
- Mount: `routes/indexRoute.js`
- Routes: `routes/authRoutes/busOwnerAuthRoutes.js`
- Entry point: `src/modules/bus-owner/auth/password-reset/index.js`
- Implementation:
  - `src/modules/bus-owner/auth/password-reset/bus-owner-password-reset.controller.js`
  - `src/modules/bus-owner/auth/password-reset/bus-owner-password-reset.service.js`
  - `src/modules/bus-owner/auth/password-reset/request-bus-owner-password-reset.service.js`
  - `src/modules/bus-owner/auth/password-reset/verify-bus-owner-reset-otp.service.js`
  - `src/modules/bus-owner/auth/password-reset/complete-bus-owner-password-reset.service.js`
  - `src/modules/bus-owner/auth/password-reset/resend-bus-owner-reset-otp.service.js`
  - `src/modules/bus-owner/auth/password-reset/bus-owner-password-reset.repository.js`
  - `src/modules/bus-owner/auth/password-reset/bus-owner-password-reset.policy.js`
  - `src/modules/bus-owner/auth/password-reset/bus-owner-password-reset.errors.js`
- Middleware inspected:
  - `middleware/otpRateLimiter.js`
  - `routes/authRoutes/busOwnerAuthRoutes.js`
- Models/utilities inspected:
  - `models/userModel.js`
  - `utils/phoneGuard.js`
  - `utils/otpHelper.js`
  - `utils/enumGuard.js`
  - `utils/passwordValidator.js`
  - `utils/tokenService.js`
- Characterization tests inspected:
  - `tests/characterization/bus-owner-password-reset-request.test.js`
  - `tests/characterization/bus-owner-password-reset-verify.test.js`
  - `tests/characterization/bus-owner-password-reset-complete.test.js`
  - `tests/characterization/bus-owner-password-reset-resend.test.js`
  - `tests/characterization/bus-owner-password-reset-errors.test.js`
- Unit tests inspected:
  - `tests/unit/bus-owner/bus-owner-password-reset-controller.test.js`
  - `tests/unit/bus-owner/bus-owner-password-reset-service.test.js`
  - `tests/unit/bus-owner/bus-owner-password-reset-repository.test.js`
  - `tests/unit/bus-owner/bus-owner-password-reset-policy.test.js`
  - `tests/unit/bus-owner/bus-owner-password-reset-errors.test.js`
- Validation command: `npm run test:bus-owner-password-reset`
