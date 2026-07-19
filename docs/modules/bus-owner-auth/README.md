# Bus-owner authentication

[Back to module documentation](../README.md)

Bus-owner authentication routes are mounted under `/api/auth/busowner` through `routes/indexRoute.js` and `routes/authRoutes/busOwnerAuthRoutes.js`.

These contracts are bus-owner-specific. Do not assume they match [general authentication](../auth/README.md) or [agent authentication](../agent-auth/README.md), even when endpoint names are similar.

## Current domains

| Domain | Status | Document |
|---|---|---|
| Registration | Modularized under `src/modules/bus-owner/auth/registration` | [Registration](registration.md) |
| Login | Modularized under `src/modules/bus-owner/auth/login` | [Login](login.md) |
| Session | Modularized under `src/modules/bus-owner/auth/session` | [Session](session.md) |
| Password reset | Legacy controller-backed — not yet modularized | Not documented in detail yet |

## Endpoint table

| Method | Full path | Middleware in order | Owning module |
|---|---|---|---|
| POST | `/api/auth/busowner/sendOTP` | `otpRateLimiter` | `busOwnerRegistration.sendOTP` |
| POST | `/api/auth/busowner/verifyOTP` | `otpVerifyLimiter` | `busOwnerRegistration.verifyOTP` |
| POST | `/api/auth/busowner/register` | None at route level | `busOwnerRegistration.register` |
| POST | `/api/auth/busowner/resendOTP` | `otpRateLimiter` | `busOwnerRegistration.resendOTP` |
| POST | `/api/auth/busowner/login` | `loginRateLimiter` | `busOwnerLogin.login` |
| POST | `/api/auth/busowner/requestPasswordReset` | `otpRateLimiter` | Legacy bus-owner auth controller |
| POST | `/api/auth/busowner/verifyOtpForReset` | `otpVerifyLimiter` | Legacy bus-owner auth controller |
| POST | `/api/auth/busowner/resetPassword` | `otpVerifyLimiter` | Legacy bus-owner auth controller |
| POST | `/api/auth/busowner/resendOtpForReset` | `otpRateLimiter` | Legacy bus-owner auth controller |
| POST | `/api/auth/busowner/refresh` | None at route level | `busOwnerSession.refresh` |
| POST | `/api/auth/busowner/logout` | None at route level | `busOwnerSession.logout` |

## Verification references

- Base branch: `dev`
- Verified commit: `c2dbc49bad53e52d85713a0696bfc79cfb912e79`
- Mount: `routes/indexRoute.js`
- Routes: `routes/authRoutes/busOwnerAuthRoutes.js`
- Entry point: `src/modules/bus-owner/auth/session/index.js`
- Implementation:
  - `src/modules/bus-owner/auth/session/bus-owner-session.controller.js`
  - `src/modules/bus-owner/auth/session/bus-owner-session.service.js`
  - `src/modules/bus-owner/auth/session/bus-owner-session.repository.js`
  - `src/modules/bus-owner/auth/session/bus-owner-session.errors.js`
- Middleware inspected:
  - `middleware/otpRateLimiter.js`
- Models/utilities inspected:
  - `models/userModel.js`
  - `models/refreshTokenModel.js`
  - `utils/tokenService.js`
- Characterization tests inspected:
  - `tests/characterization/bus-owner-session-refresh.test.js`
  - `tests/characterization/bus-owner-session-logout.test.js`
- Unit tests inspected:
  - `tests/unit/bus-owner/bus-owner-session-controller.test.js`
  - `tests/unit/bus-owner/bus-owner-session-controller-logout.test.js`
  - `tests/unit/bus-owner/bus-owner-session-service.test.js`
  - `tests/unit/bus-owner/bus-owner-session-repository.test.js`
  - `tests/unit/bus-owner/bus-owner-session-errors.test.js`
- Validation command: `npm run test:bus-owner-session`
