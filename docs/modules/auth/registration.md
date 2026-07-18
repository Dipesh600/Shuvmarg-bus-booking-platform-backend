# Registration

[Back to general authentication](README.md)

## Purpose

Passenger registration creates a new platform user after phone OTP verification. It exists to split registration into OTP send, OTP verification, and final account creation with referral handling.

## Who uses it

Unauthenticated passenger clients using `/api` registration routes.

## Responsibilities

- Send `REGISTRATION` OTPs for unregistered phones.
- Verify registration OTPs and issue a registration verification token.
- Complete passenger account creation after OTP proof and verification-token validation.
- Apply referral rewards and create referral history best-effort.

## What this module does not do

- It does not register agents; see [agent registration](../agent-auth/registration.md).
- It does not reset forgotten passwords; see [password reset](password-reset.md).
- It does not activate invited staff accounts; see [account activation](account-activation.md).

## Public endpoints

| Method | Full path | Middleware in order | Handler |
|---|---|---|---|
| POST | `/api/sendPhoneOTP` | `otpRateLimiter` | `registrationModule.sendPhoneOTP` |
| POST | `/api/verifyPhoneOTP` | `otpVerifyLimiter` | `registrationModule.verifyPhoneOTP` |
| POST | `/api/completeRegistration` | None at route level | `registrationModule.completeRegistration` |

## Request and response walkthrough

`sendPhoneOTP` reads `phone`. Missing phone returns `400` with `status: false` and `Phone number is required!`. Existing phones receive the neutral `200` response without OTP data. New phones call `createAndSendOTP(phone, "REGISTRATION")` and return the same neutral message plus `data.expiresIn`. `OTP_SEND_BLOCKED` maps to `429`.

`verifyPhoneOTP` reads `phone` and `otp`, strips non-digits from `otp`, requires six digits, verifies `REGISTRATION`, checks that the phone was not registered in the meantime, and returns a signed `verificationToken`.

`completeRegistration` reads `phone`, `name`, `email`, `address`, `password`, `gender`, `referralCode`, and `verificationToken`. It requires fields in phone/name/password/address/gender order, validates the `REGISTRATION` verification token, requires a used `REGISTRATION` OTP from the last 30 minutes, checks phone/email uniqueness, validates password rules, hashes with bcrypt cost `12`, creates the User, and returns `201`.

No refresh-token cookie or login token is issued by passenger registration.

## Flow walkthrough

1. Send OTP only if `phoneGuard.isPhoneRegistered` says the phone is not registered.
2. Verify OTP with purpose `REGISTRATION`; OTP is consumed by `otpHelper.verifyOTPCode`.
3. Issue a 30-minute verification token bound to phone and purpose.
4. Complete registration validates the token before checking the used OTP record.
5. Password is validated before hashing.
6. Referral code, if supplied, is resolved before the passenger User is created.
7. Referral history creation is best-effort and does not roll back registration.

## Authentication or ownership proof

The proof is the consumed `REGISTRATION` OTP plus the signed verification token from `utils/verificationToken.js`.

## Data read and changed

| Model/document | Reads | Changes |
|---|---|---|
| `User` | Phone registration, email uniqueness, referral-code owner | Creates passenger user with `roles: ["passenger"]`, `phoneVerified: true`, `isVerified: true`, `referralCode`; may increment referrer `totalReferrals` and `yatrapoints`. |
| `OTP` | Used `REGISTRATION` OTP and timestamp | OTP is created/updated by `otpHelper` and consumed during verification. |
| `ReferralHistory` | None | Best-effort creation for valid referral use. |

## Dependencies

- `phoneGuard` checks existing phone registrations.
- `otpHelper` sends/verifies `REGISTRATION` OTPs.
- `verificationToken` binds OTP verification to registration completion.
- `passwordValidator` enforces password rules.
- `bcryptjs` hashes with cost `12`.
- `referralCodeGenerator` and `referral.service` own referral side effects.

## Security-sensitive behavior

- Existing-phone OTP send returns an enumeration-resistant `200`.
- The final registration step requires both a used OTP record and a matching verification token.
- OTP freshness is 30 minutes, checked from `OTP.updatedAt`.
- Do not issue login tokens from this flow.

## Tests

Characterization tests cover send, verify, completion, uniqueness, success, and referral behavior. Unit tests cover controller DTOs, OTP services, completion ordering, and referral service behavior.

## Known limitations or inconsistencies

The module uses `status` response fields for many contracts, while some related auth modules use `success`.

## Safe extension guidance

Before changing registration, verify OTP purpose, token binding, uniqueness order, bcrypt cost, referral side effects, and the explicit test paths in `package.json`.

## Verification references

- Base branch: `dev`
- Verified commit: `17175676a11842f66fb28c96e4bf54bb37a0d262`
- Mount: `routes/indexRoute.js`
- Routes: `routes/userRoutes/userRoutes.js`
- Entry point: `src/modules/auth/registration/index.js`
- Implementation:
  - `src/modules/auth/registration/registration.controller.js`
  - `src/modules/auth/registration/send-phone-otp.service.js`
  - `src/modules/auth/registration/verify-phone-otp.service.js`
  - `src/modules/auth/registration/complete-registration.service.js`
  - `src/modules/auth/registration/registration.repository.js`
  - `src/modules/auth/registration/registration.policy.js`
  - `src/modules/auth/registration/registration.errors.js`
  - `src/modules/auth/registration/referral.service.js`
  - `src/modules/auth/registration/registration.mapper.js`
- Middleware:
  - `middleware/otpRateLimiter.js`
- Models/utilities inspected:
  - `models/userModel.js`
  - `models/otpModel.js`
  - `models/referralModel.js`
  - `utils/otpHelper.js`
  - `utils/phoneGuard.js`
  - `utils/passwordValidator.js`
  - `utils/verificationToken.js`
  - `handlers/referralCodeGenerator.js`
- Characterization tests inspected:
  - `tests/characterization/auth-registration-send.test.js`
  - `tests/characterization/auth-registration-verify.test.js`
  - `tests/characterization/auth-registration-complete.test.js`
  - `tests/characterization/auth-registration-complete-success.test.js`
  - `tests/characterization/auth-registration-uniqueness.test.js`
  - `tests/characterization/auth-registration-referral.test.js`
- Unit tests inspected:
  - `tests/unit/auth/registration-controller.test.js`
  - `tests/unit/auth/send-phone-otp-service.test.js`
  - `tests/unit/auth/verify-phone-otp-service.test.js`
  - `tests/unit/auth/complete-registration-service.test.js`
  - `tests/unit/auth/registration-referral-service.test.js`
- Validation command: `npm run test:registration`
