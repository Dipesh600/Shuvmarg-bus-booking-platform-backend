# Agent authentication modules

[Back to module documentation](../README.md)

Agent authentication routes are mounted by `routes/indexRoute.js` at `/api/auth/agent` and registered in `routes/authRoutes/agentAuthRoutes.js`.

Agent authentication has agent-specific response contracts. Verify them independently from the general authentication modules.

## Current domains

| Domain | Document |
|---|---|
| Agent registration | [registration.md](registration.md) |
| Agent login | [login.md](login.md) |
| Agent session | [session.md](session.md) |
| Agent password reset | [password-reset.md](password-reset.md) |

## Endpoint ownership

| Method | Full path | Middleware in order | Owning module |
|---|---|---|---|
| POST | `/api/auth/agent/sendOTP` | `otpRateLimiter` | Agent registration |
| POST | `/api/auth/agent/verifyOTP` | `otpVerifyLimiter` | Agent registration |
| POST | `/api/auth/agent/register` | None at route level | Agent registration |
| POST | `/api/auth/agent/resendOTP` | `otpRateLimiter` | Agent registration |
| POST | `/api/auth/agent/login` | `loginRateLimiter` | Agent login |
| POST | `/api/auth/agent/refresh` | None at route level | Agent session |
| POST | `/api/auth/agent/logout` | None at route level | Agent session |
| POST | `/api/auth/agent/requestPasswordReset` | `otpRateLimiter` | Agent password reset |
| POST | `/api/auth/agent/verifyOtpForReset` | `otpVerifyLimiter` | Agent password reset |
| POST | `/api/auth/agent/resetPassword` | `otpVerifyLimiter` | Agent password reset |
| POST | `/api/auth/agent/resendOtpForReset` | `otpRateLimiter` | Agent password reset |

## Verification references

- Base branch: `dev`
- Verified commit: `17175676a11842f66fb28c96e4bf54bb37a0d262`
- Mount: `routes/indexRoute.js`
- Routes: `routes/authRoutes/agentAuthRoutes.js`
- Entry point: Not applicable — overview only
- Implementation:
  - `src/modules/agent/auth/registration/index.js`
  - `src/modules/agent/auth/login/index.js`
  - `src/modules/agent/auth/session/index.js`
  - `src/modules/agent/auth/password-reset/index.js`
- Middleware:
  - `middleware/otpRateLimiter.js`
- Models/utilities inspected:
  - `models/userModel.js`
  - `models/agentModel.js`
  - `models/otpModel.js`
  - `models/PartnerLead.js`
  - `models/refreshTokenModel.js`
  - `utils/tokenService.js`
  - `utils/otpHelper.js`
  - `utils/phoneGuard.js`
  - `utils/passwordValidator.js`
  - `utils/verificationToken.js`
  - `utils/enumGuard.js`
- Tests:
  - `tests/characterization/agent-*.test.js`
  - `tests/unit/agent/*.test.js`
- Validation command: `npm run test:auth`
