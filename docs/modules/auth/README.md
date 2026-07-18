# General authentication modules

[Back to module documentation](../README.md)

General user authentication routes are mounted by `routes/indexRoute.js` under `/api` and registered in `routes/userRoutes/userRoutes.js`.

## Current domains

| Domain | Document | Current status |
|---|---|---|
| Registration | [registration.md](registration.md) | Modularized under `src/modules/auth/registration`. |
| Login | [login.md](login.md) | Modularized under `src/modules/auth/login`. |
| Session | [session.md](session.md) | Modularized under `src/modules/auth/session`. |
| Password reset | [password-reset.md](password-reset.md) | Modularized under `src/modules/auth/password-reset`. |
| OTP resend | [otp-resend.md](otp-resend.md) | Modularized under `src/modules/auth/otp-resend`. |
| Update password | [update-password.md](update-password.md) | Modularized under `src/modules/auth/update-password`. |
| Force password | [force-password.md](force-password.md) | Modularized under `src/modules/auth/force-password`. |
| Profile | [profile.md](profile.md) | Modularized under `src/modules/auth/profile`. |
| Account activation | [account-activation.md](account-activation.md) | Legacy controller-backed flow, not yet modularized under `src/modules`. |

## Flow distinction

| Flow | Primary purpose | Proof |
|---|---|---|
| Update password | Voluntary change by an authenticated user | Access token accepted by `auth`, DB-backed authorization from `verifyRoleFromDB`, and current password comparison. |
| Password reset | Forgotten-password recovery | Password-reset OTP using `PASSWORD_RESET`; verify step peeks, reset step consumes. |
| Force password | Mandatory replacement of a temporary/admin-issued password after login reaches force-password handling | Temporary JWT with purpose `FORCE_PASSWORD_CHANGE`; optional `ACCOUNT_ACTIVATION` OTP only when both `phone` and `otp` are supplied. |
| Account activation | Activate an invited account | User must be found with `status: "invited"` and must verify an `ACCOUNT_ACTIVATION` OTP. |

## Verification references

- Base branch: `dev`
- Verified commit: `17175676a11842f66fb28c96e4bf54bb37a0d262`
- Mount: `routes/indexRoute.js`
- Routes: `routes/userRoutes/userRoutes.js`, `routes/authRoutes/activateAuthRoutes.js`
- Entry point: Not applicable — overview only
- Implementation:
  - `src/modules/auth/registration/index.js`
  - `src/modules/auth/login/index.js`
  - `src/modules/auth/session/index.js`
  - `src/modules/auth/password-reset/index.js`
  - `src/modules/auth/otp-resend/index.js`
  - `src/modules/auth/update-password/index.js`
  - `src/modules/auth/force-password/index.js`
  - `src/modules/auth/profile/index.js`
  - `controllers/authControllers.js/activateAccountController.js`
- Middleware:
  - `middleware/authMiddleware.js`
  - `middleware/verifyRoleFromDB.js`
  - `middleware/otpRateLimiter.js`
  - `middleware/autoGenerateReferralCode.js`
- Models/utilities inspected:
  - `models/userModel.js`
  - `models/otpModel.js`
  - `models/refreshTokenModel.js`
  - `utils/tokenService.js`
  - `utils/otpHelper.js`
  - `utils/phoneGuard.js`
  - `utils/passwordValidator.js`
  - `utils/verificationToken.js`
  - `utils/enumGuard.js`
- Tests:
  - `tests/characterization/auth-*.test.js`
  - `tests/unit/auth/*.test.js`
- Validation command: `npm run test:auth`
