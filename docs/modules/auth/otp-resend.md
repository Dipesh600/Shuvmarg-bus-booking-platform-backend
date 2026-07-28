# OTP resend

[Back to general authentication](README.md)

## Purpose

OTP resend sends a new OTP for selected general authentication purposes while preserving purpose-specific account checks.

## Who uses it

Unauthenticated general clients calling `/api/resendOtp`.

## Responsibilities

- Validate phone presence.
- Resolve OTP purpose, defaulting to `REGISTRATION`.
- Apply purpose-specific checks.
- Send a new OTP and return expiry metadata.
- Map OTP send blocking to the legacy `429` response.

## What this module does not do

- It does not verify OTPs.
- It does not perform agent OTP resend; see [agent registration](../agent-auth/registration.md) and [agent password reset](../agent-auth/password-reset.md).

## Public endpoints

| Method | Full path | Middleware in order | Handler |
|---|---|---|---|
| POST | `/api/resendOtp` | `otpRateLimiter` | `otpResendModule.resendOtp` |

## Request and response walkthrough

The controller reads `phone` and `purpose`. `purpose` defaults to `REGISTRATION`; valid values are `REGISTRATION`, `PASSWORD_RESET`, and `ACCOUNT_ACTIVATION`.

For `REGISTRATION`, existing phones return `409 PHONE_ALREADY_REGISTERED`. For `PASSWORD_RESET`, phone is normalized and unknown accounts return a neutral `200` without sending OTP. For `ACCOUNT_ACTIVATION`, no account precondition is applied in this module.

Successful sends call `createAndSendOTP(phone, otpPurpose)` and return `200 New OTP sent successfully!` with `data.expiresIn`. `OTP_SEND_BLOCKED` returns `429` with `retryAfterMinutes`.

## Flow walkthrough

1. Require phone.
2. Resolve purpose.
3. Check registration or password-reset preconditions.
4. Return neutral success for unknown password-reset account.
5. Send OTP.
6. Map expected and unexpected failures.

## Authentication or ownership proof

This endpoint does not prove ownership; it initiates or repeats OTP delivery.

## Data read and changed

| Model/document | Reads | Changes |
|---|---|---|
| `User` | Registration and password-reset precondition checks | None directly. |
| `OTP` | Existing send-block state through `otpHelper` | Creates/updates OTP for the requested purpose. |

## Dependencies

- `phoneGuard.isPhoneRegistered` blocks registration resend for existing users.
- `phoneGuard.normalizePhone` normalizes password-reset lookup.
- `otpHelper.createAndSendOTP` sends OTP.

## Security-sensitive behavior

- Unknown password-reset accounts receive a neutral `200`.
- Purpose validation is case-sensitive.
- `ACCOUNT_ACTIVATION` is allowed and intentionally has no account precondition here.

## Tests

Characterization and unit tests cover purpose handling, account checks, `OTP_SEND_BLOCKED`, failure mapping, and patch isolation for phone guard/repository/OTP helper.

## Known limitations or inconsistencies

The route-level `otpRateLimiter` missing-phone response uses a period, while service-level missing-phone validation uses an exclamation mark if the request reaches the service.

## Safe extension guidance

Before adding a purpose, update `VALID_PURPOSES`, define account preconditions, add characterization tests, and document whether the response is enumeration-resistant.

## Verification references

- Base branch: `dev`
- Verified commit: `17175676a11842f66fb28c96e4bf54bb37a0d262`
- Mount: `routes/indexRoute.js`
- Routes: `routes/userRoutes/userRoutes.js`
- Entry point: `src/modules/auth/otp-resend/index.js`
- Implementation:
  - `src/modules/auth/otp-resend/otp-resend.controller.js`
  - `src/modules/auth/otp-resend/otp-resend.service.js`
  - `src/modules/auth/otp-resend/otp-resend.repository.js`
  - `src/modules/auth/otp-resend/otp-resend.policy.js`
  - `src/modules/auth/otp-resend/otp-resend.errors.js`
- Middleware:
  - `middleware/otpRateLimiter.js`
- Models/utilities inspected:
  - `models/userModel.js`
  - `models/otpModel.js`
  - `utils/otpHelper.js`
  - `utils/phoneGuard.js`
- Characterization tests inspected:
  - `tests/characterization/auth-resend-otp.test.js`
- Unit tests inspected:
  - `tests/unit/auth/otp-resend-controller.test.js`
  - `tests/unit/auth/otp-resend-service.test.js`
  - `tests/unit/auth/otp-resend-service-errors.test.js`
  - `tests/unit/auth/otp-resend-account-check-errors.test.js`
- Validation command: `npm run test:otp-resend`
