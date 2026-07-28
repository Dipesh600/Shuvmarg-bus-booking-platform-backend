# Agent password reset

[Back to agent authentication](README.md)

Related: [agent login](login.md).

## Purpose

Agent password reset lets an agent recover access through an agent-specific password-reset OTP flow.

## Who uses it

Unauthenticated agent clients under `/api/auth/agent`.

## Responsibilities

- Request `AGENT_PASSWORD_RESET` OTPs with anti-enumeration behavior.
- Verify reset OTPs without consuming them.
- Consume the OTP while completing the password reset.
- Resend reset OTPs with suspended-account handling.
- Reset user security fields, revoke refresh tokens, and increment `tokenVersion`.

## What this module does not do

- It does not issue new access or refresh tokens after reset.
- It does not use general passenger password-reset response contracts.
- It does not log the agent in; see [agent login](login.md).

## Public endpoints

| Method | Full path | Middleware in order | Handler |
|---|---|---|---|
| POST | `/api/auth/agent/requestPasswordReset` | `otpRateLimiter` | `agentPasswordReset.requestPasswordReset` |
| POST | `/api/auth/agent/verifyOtpForReset` | `otpVerifyLimiter` | `agentPasswordReset.verifyOtpForReset` |
| POST | `/api/auth/agent/resetPassword` | `otpVerifyLimiter` | `agentPasswordReset.resetPassword` |
| POST | `/api/auth/agent/resendOtpForReset` | `otpRateLimiter` | `agentPasswordReset.resendOtpForReset` |

## Request and response walkthrough

`requestPasswordReset` reads raw `phone`, normalizes it, requires presence, then runs lookup/role check/OTP send inside `withMinimumLatency(..., 600)`. Missing or non-agent accounts return the same neutral `200` as eligible accounts. This endpoint does not check banned/inactive status before sending an OTP.

`verifyOtpForReset` reads `phone` and `otp`, strips non-digits, requires six digits, and calls `otpFirstVerify(phone, cleanOtp, "AGENT_PASSWORD_RESET", false, verifyOTPCode, userLookup)`. A valid OTP for a non-agent returns `400 Invalid or expired verification code.` Success returns `200 OTP verified. Proceed to reset password.`

`resetPassword` reads `phone`, `otp`, and `newPassword`. It normalizes, validates required inputs, sanitizes OTP, finds User by phone, checks agent role, verifies and consumes OTP with `consume=true`, validates password, runs `bcrypt.genSalt(10)` and `bcrypt.hash(newPassword, salt)`, mutates the user, saves, revokes all refresh tokens, increments `tokenVersion`, and returns success. No new tokens or cookies are returned.

`resendOtpForReset` returns a neutral `200` for missing/non-agent accounts, returns `403 ACCOUNT_SUSPENDED` for banned/inactive agents after role confirmation, and sends `AGENT_PASSWORD_RESET` OTP for eligible agents.

## Flow walkthrough

1. Request: normalize → require phone → minimum-latency protected lookup → role check → optional OTP send → neutral response.
2. Verify: normalize → require phone/OTP → sanitize → OTP-first peek with `consume=false` → agent-role check → success.
3. Complete reset: normalize → require all fields → sanitize → find user → role check → OTP consume with `true` → password validation → salt/hash → mutate/save → revoke → increment.
4. Resend: normalize → require phone → find user → role check → suspended check → OTP send.

## Authentication or ownership proof

The proof is possession of a valid `AGENT_PASSWORD_RESET` OTP. Verification peeks with `consume=false`; final reset consumes with `consume=true`.

## Data read and changed

| Model/document | Reads | Changes |
|---|---|---|
| `User` | Phone lookup, roles/role, status, password-reset target | Sets `password`; sets `isVerified=true` only when falsey; sets `failedLoginAttempts=0`, `lockedUntil=null`, `forcePasswordChange=false`; increments `tokenVersion`. |
| `OTP` | `AGENT_PASSWORD_RESET` record | Created by request/resend; peeked by verify; consumed by reset. |
| `RefreshToken` | None directly | `revokeAllUserTokens` deletes all refresh tokens after save. |

## Dependencies

- `phoneGuard` normalizes phone and checks agent role.
- `enumGuard.withMinimumLatency` and `otpFirstVerify` preserve anti-enumeration behavior.
- `otpHelper` sends and verifies `AGENT_PASSWORD_RESET`.
- `passwordValidator` validates new password.
- `bcryptjs` uses `genSalt(10)` then `hash`.
- `tokenService.revokeAllUserTokens` invalidates refresh sessions.

## Security-sensitive behavior

- Request minimum latency is `600` ms.
- Request does not filter banned/inactive users before OTP dispatch.
- Verify uses OTP-first ordering and `consume=false`.
- Reset verifies OTP with `user.phone` and `consume=true` before password validation.
- Save happens before refresh-token revocation; revocation happens before `tokenVersion` increment.

## Tests

Characterization tests cover request, verify, complete reset, resend, and endpoint-specific generic errors. Unit tests cover controller DTOs, policy constants, repository calls, errors, OTP blocked mapping, and reset ordering.

## Known limitations or inconsistencies

`requestPasswordReset` can send OTP to banned/inactive agent accounts because suspension is not checked in that endpoint. `resendOtpForReset` does check suspension after confirming the account exists and has the agent role.

## Safe extension guidance

Before changing this module, verify `AGENT_PASSWORD_RESET`, 600 ms latency, OTP peek/consume flags, password validation order, bcrypt salt/hash sequence, user mutations, save/revoke/increment order, and neutral response contracts.

## Verification references

- Base branch: `dev`
- Verified commit: `17175676a11842f66fb28c96e4bf54bb37a0d262`
- Mount: `routes/indexRoute.js`
- Routes: `routes/authRoutes/agentAuthRoutes.js`
- Entry point: `src/modules/agent/auth/password-reset/index.js`
- Implementation:
  - `src/modules/agent/auth/password-reset/agent-password-reset.controller.js`
  - `src/modules/agent/auth/password-reset/agent-password-reset.service.js`
  - `src/modules/agent/auth/password-reset/request-agent-password-reset.service.js`
  - `src/modules/agent/auth/password-reset/verify-agent-reset-otp.service.js`
  - `src/modules/agent/auth/password-reset/complete-agent-password-reset.service.js`
  - `src/modules/agent/auth/password-reset/resend-agent-reset-otp.service.js`
  - `src/modules/agent/auth/password-reset/agent-password-reset.repository.js`
  - `src/modules/agent/auth/password-reset/agent-password-reset.policy.js`
  - `src/modules/agent/auth/password-reset/agent-password-reset.errors.js`
- Middleware:
  - `middleware/otpRateLimiter.js`
- Models/utilities inspected:
  - `models/userModel.js`
  - `models/otpModel.js`
  - `models/refreshTokenModel.js`
  - `utils/phoneGuard.js`
  - `utils/otpHelper.js`
  - `utils/enumGuard.js`
  - `utils/passwordValidator.js`
  - `utils/tokenService.js`
- Characterization tests inspected:
  - `tests/characterization/agent-password-reset-request.test.js`
  - `tests/characterization/agent-password-reset-verify.test.js`
  - `tests/characterization/agent-password-reset-complete.test.js`
  - `tests/characterization/agent-password-reset-resend.test.js`
  - `tests/characterization/agent-password-reset-errors.test.js`
- Unit tests inspected:
  - `tests/unit/agent/agent-password-reset-controller.test.js`
  - `tests/unit/agent/agent-password-reset-service.test.js`
  - `tests/unit/agent/agent-password-reset-repository.test.js`
  - `tests/unit/agent/agent-password-reset-policy.test.js`
  - `tests/unit/agent/agent-password-reset-errors.test.js`
- Validation command: `npm run test:agent-password-reset`
