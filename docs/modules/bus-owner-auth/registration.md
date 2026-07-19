# Bus-owner registration

[Back to bus-owner authentication](README.md)

## Purpose

This module owns the self-registration flow for bus-owner accounts. It verifies phone ownership with an OTP, then either creates a new `User` with the `busOwner` role or upgrades an existing non-bus-owner user by adding that role.

## Who uses it

Bus-owner web clients using the `/api/auth/busowner` registration endpoints.

## Responsibilities

- Send and resend registration OTPs with purpose `BUSOWNER_REGISTRATION`.
- Verify registration OTPs and issue a verification token.
- Complete new-user registration or existing-user role upgrade.
- Create a `BusOwner` profile when one does not already exist.
- Create or convert `PartnerLead` records as best-effort, non-fatal side effects.

## What this module does not do

- It does not handle bus-owner login, session refresh/logout, or password reset.
- It does not submit KYC documents.
- It does not update an existing `BusOwner` profile.
- It does not add transactions or roll back partial writes.

## Public endpoints

| Method | Full path | Middleware in order | Handler |
|---|---|---|---|
| POST | `/api/auth/busowner/sendOTP` | `otpRateLimiter` | `busOwnerRegistration.sendOTP` |
| POST | `/api/auth/busowner/verifyOTP` | `otpVerifyLimiter` | `busOwnerRegistration.verifyOTP` |
| POST | `/api/auth/busowner/register` | None at route level | `busOwnerRegistration.register` |
| POST | `/api/auth/busowner/resendOTP` | `otpRateLimiter` | `busOwnerRegistration.resendOTP` |

## Request and response walkthrough

`sendOTP` reads `phone`, normalizes it with `phoneGuard.normalizePhone`, validates the Nepal mobile regex `/^(97|98)\d{8}$/`, checks whether the phone already has the `busOwner` role, and sends `BUSOWNER_REGISTRATION` OTP only for eligible phones. Existing bus owners and banned or inactive existing users receive the same neutral `200` success body without an OTP.

`verifyOTP` reads `phone` and `otp`, strips non-digits with `String(otp).replace(/\D/g, "")`, requires exactly six digits, and calls `verifyOTPCode(phone, cleanOtp, "BUSOWNER_REGISTRATION")`. After a valid OTP it re-checks the bus-owner role to catch a race, starts the `PartnerLead` `otp_verified` upsert, issues a verification token bound to phone and purpose, and returns `exists`, nullable `userName`, and `verificationToken`. It does not return `existingRoles`.

`register` requires fields in this order: phone, name, companyName. It validates trimmed name and company-name lengths, validates the verification token before the consumed OTP lookup, requires a used `BUSOWNER_REGISTRATION` OTP record, and enforces a 30-minute recency window with strict `<` comparison. Existing users are upgraded by adding `roles: "busOwner"` and setting `roleActivatedAt.busOwner`; the upgrade path does not require, validate, hash, or replace a password. New users require a valid password, optional unique normalized email, bcrypt hash cost `12`, and a new active `User` with `role` and `roles` set to `busOwner`.

After user persistence, the module checks for an existing `BusOwner` profile. If none exists, it creates one with trimmed `companyName` and `verificationStatus: "pending"`. Existing profiles are preserved. Tokens are generated only after profile handling. The refresh token is set only as an HTTP-only cookie; it is not returned in JSON.

`resendOTP` normalizes `phone`, rejects existing bus owners with `ROLE_ALREADY_REGISTERED`, otherwise sends a new `BUSOWNER_REGISTRATION` OTP. It intentionally does not apply the Nepal regex used by `sendOTP`.

## Flow walkthrough

1. `sendOTP`: normalize → require phone → Nepal regex → role/status check → optional OTP send → neutral response.
2. `verifyOTP`: normalize → require phone/OTP → sanitize OTP → verify OTP → role race check → fire-and-forget lead upsert → verification token → response.
3. `register`: normalize → required fields → length checks → verification token → consumed OTP → OTP recency → role check → upgrade or new user → BusOwner profile → token generation → public user → lead conversion → cookie/response.
4. `resendOTP`: normalize → require phone → role check → OTP send → response.

## Authentication or ownership proof

Registration relies on a registration OTP plus a signed verification token. The consumed OTP proves the phone was verified; the verification token binds the registration request to the phone and `BUSOWNER_REGISTRATION` purpose.

## Data read and changed

| Model/document | Reads | Changes |
|---|---|---|
| `User` | Existing user by phone through `checkPhoneForRole`; duplicate email on new-user path | Existing users gain `roles: "busOwner"` and `roleActivatedAt.busOwner`; new users are created with active status, phone verified, and `isVerified: false` |
| `OTP` | Used `BUSOWNER_REGISTRATION` OTP by phone | Verification occurs through `verifyOTPCode`; registration only reads consumed OTP |
| `BusOwner` | Existing profile by `user` | Missing profile is created with `verificationStatus: "pending"` |
| `PartnerLead` | No required read | `otp_verified` upsert after verify; conversion `updateMany` after register |
| Refresh-token storage | Through `tokenService.generateTokenPair` | New refresh token is created and delivered by cookie only |

## Dependencies

- `phoneGuard.normalizePhone` and `checkPhoneForRole` provide phone normalization and multi-role checks.
- `otpHelper.createAndSendOTP` and `verifyOTPCode` handle OTP delivery and verification.
- `verificationToken` issues and validates the registration verification token.
- `passwordValidator` and `bcryptjs` enforce and hash new-user passwords.
- `tokenService.generateTokenPair` creates the post-registration session.
- Repositories own direct model access for `User`, `OTP`, `BusOwner`, and `PartnerLead`.

## Security-sensitive behavior

- `sendOTP` uses enumeration-resistant neutral `200` responses for eligible and ineligible states.
- OTP purpose remains exactly `BUSOWNER_REGISTRATION`.
- `verifyOTP` sanitizes formatting characters before the six-digit check.
- Verification token validation happens before consumed OTP lookup.
- Upgrade does not replace the existing password.
- BusOwner profile handling happens before token generation.
- Lead writes are fire-and-forget and non-fatal.
- The flow is non-transactional; earlier writes may remain when later work fails.
- Refresh tokens remain cookie-only with `httpOnly`, production-only `secure`, `sameSite: "Lax"`, and seven-day `maxAge`.

## Tests

Characterization tests:

- `tests/characterization/bus-owner-registration-send-otp.test.js`
- `tests/characterization/bus-owner-registration-verify-otp.test.js`
- `tests/characterization/bus-owner-registration-new-user.test.js`
- `tests/characterization/bus-owner-registration-upgrade.test.js`
- `tests/characterization/bus-owner-registration-errors.test.js`
- `tests/characterization/bus-owner-registration-resend-otp.test.js`

Unit tests:

- `tests/unit/bus-owner/bus-owner-registration-controller.test.js`
- `tests/unit/bus-owner/bus-owner-registration-service.test.js`
- `tests/unit/bus-owner/bus-owner-registration-repository.test.js`
- `tests/unit/bus-owner/bus-owner-registration-policy.test.js`
- `tests/unit/bus-owner/bus-owner-registration-errors.test.js`

Run them with `npm run test:bus-owner-registration`.

## Known limitations or inconsistencies

- `sendOTP` validates Nepal phone format, but `resendOTP` does not.
- Existing-user upgrade ignores a supplied password and does not replace the existing password.
- Existing `BusOwner` profiles are not updated, even when the registration request contains a different company name.
- The flow is not transactional, so partial writes can remain after later failures.

## Safe extension guidance

Before changing this module, verify route middleware order, OTP purpose, neutral send behavior, verification-token binding, consumed OTP recency, upgrade password behavior, BusOwner profile preservation, cookie options, and non-fatal lead writes. Update this document and the bus-owner registration tests in the same pull request when those contracts change.

## Verification references

- Base branch: `dev`
- Verified commit: `refactor/bus-owner-registration` working tree
- Mount: `routes/indexRoute.js`
- Routes: `routes/authRoutes/busOwnerAuthRoutes.js`
- Entry point: `src/modules/bus-owner/auth/registration/index.js`
- Implementation:
  - `src/modules/bus-owner/auth/registration/bus-owner-registration.controller.js`
  - `src/modules/bus-owner/auth/registration/bus-owner-registration.service.js`
  - `src/modules/bus-owner/auth/registration/bus-owner-registration-otp.service.js`
  - `src/modules/bus-owner/auth/registration/bus-owner-registration-completion.service.js`
  - `src/modules/bus-owner/auth/registration/bus-owner-registration.repository.js`
  - `src/modules/bus-owner/auth/registration/bus-owner-registration-lead.repository.js`
  - `src/modules/bus-owner/auth/registration/bus-owner-registration.policy.js`
  - `src/modules/bus-owner/auth/registration/bus-owner-registration.errors.js`
- Middleware inspected:
  - `middleware/otpRateLimiter.js`
  - `routes/authRoutes/busOwnerAuthRoutes.js`
- Models/utilities inspected:
  - `models/userModel.js`
  - `models/busOwnerModel.js`
  - `models/otpModel.js`
  - `models/PartnerLead.js`
  - `utils/phoneGuard.js`
  - `utils/otpHelper.js`
  - `utils/passwordValidator.js`
  - `utils/tokenService.js`
  - `utils/verificationToken.js`
- Characterization tests inspected:
  - `tests/characterization/bus-owner-registration-send-otp.test.js`
  - `tests/characterization/bus-owner-registration-verify-otp.test.js`
  - `tests/characterization/bus-owner-registration-new-user.test.js`
  - `tests/characterization/bus-owner-registration-upgrade.test.js`
  - `tests/characterization/bus-owner-registration-errors.test.js`
  - `tests/characterization/bus-owner-registration-resend-otp.test.js`
- Unit tests inspected:
  - `tests/unit/bus-owner/bus-owner-registration-controller.test.js`
  - `tests/unit/bus-owner/bus-owner-registration-service.test.js`
  - `tests/unit/bus-owner/bus-owner-registration-repository.test.js`
  - `tests/unit/bus-owner/bus-owner-registration-policy.test.js`
  - `tests/unit/bus-owner/bus-owner-registration-errors.test.js`
- Validation command: `npm run test:bus-owner-registration`
