# Account activation

[Back to general authentication](README.md)

Implementation status: Legacy controller-backed flow. Not yet extracted into `src/modules`.

Related: [force password](force-password.md).

## Purpose

Account activation activates invited accounts by sending an activation OTP, verifying it, setting a password, and issuing a normal session.

## Who uses it

Clients activating users that currently match `User.findOne({ phone, status: "invited" })`.

## Responsibilities

- Send `ACCOUNT_ACTIVATION` OTPs for invited users.
- Verify activation OTP.
- Validate and hash the new password.
- Change user status and verification flags.
- Revoke old refresh tokens before issuing new tokens.

## What this module does not do

- It does not handle normal login force-password completion; see [force password](force-password.md).
- It does not reset forgotten passwords.
- It is not currently a modular `src/modules` implementation.

## Public endpoints

| Method | Full path | Middleware in order | Handler |
|---|---|---|---|
| POST | `/api/auth/activate/sendOTP` | `otpRateLimiter` | `activateController.sendActivationOTP` |
| POST | `/api/auth/activate` | None at route level | `activateController.activateAccount` |

## Request and response walkthrough

`sendActivationOTP` reads `phone`. Missing phone returns `400`. It finds a user by `{ phone, status: "invited" }`; no match returns `404 No pending activation found for this phone number.` A match sends `ACCOUNT_ACTIVATION` OTP and returns `200 Activation OTP sent!` with `data.phone` and `data.expiresIn`.

`activateAccount` reads `phone`, `otp`, and `newPassword`. It requires all three, finds an invited user with password selected, verifies `ACCOUNT_ACTIVATION` OTP, validates password, hashes with bcrypt cost `12`, sets `status="active"`, `forcePasswordChange=false`, `phoneVerified=true`, and `isVerified=true`, saves the user, revokes all old refresh tokens, generates a token pair, removes `password`, sets refresh-token cookie if present, and returns `accessToken`.

## Flow walkthrough

1. Send OTP only for an invited user.
2. Activation requires phone, OTP, and new password.
3. User lookup by invited status happens before OTP verification.
4. OTP verification happens before password validation.
5. Password save happens before token revocation.
6. New tokens are generated after revocation.

## Authentication or ownership proof

The proof is invited account state plus a valid `ACCOUNT_ACTIVATION` OTP.

## Data read and changed

| Model/document | Reads | Changes |
|---|---|---|
| `User` | Finds by `phone` and `status: "invited"`; activation selects `+password` | Sets `password`, `status`, `forcePasswordChange`, `phoneVerified`, `isVerified`; saves document. |
| `OTP` | `ACCOUNT_ACTIVATION` record | Created by send endpoint; verified/consumed by activation. |
| `RefreshToken` | None directly | Deletes all old refresh tokens before issuing a new pair. |

## Dependencies

- `otpRateLimiter` protects activation OTP sending.
- `otpHelper` sends/verifies `ACCOUNT_ACTIVATION`.
- `passwordValidator` validates the new password.
- `bcryptjs` hashes with cost `12`.
- `tokenService` revokes old tokens and issues the new session.

## Security-sensitive behavior

- Production lookup accepts only `status: "invited"`.
- General login rejects `status: "invited"` before normal force-password handling.
- Invited users therefore do not obtain a force-password temp token through general login.
- Refresh token is cookie-only.

## Tests

No dedicated npm script was found for activation during this documentation pass. Related behavior is indirectly visible in login tests for invited users and OTP purpose support in shared utilities.

## Known limitations or inconsistencies

The route and controller comments describe conductors, drivers, and admin-onboarded bus-owner activation. The code only accepts users with `status: "invited"`. The verified admin bus-owner creation path in `controllers/adminController/busOwnerController/adminBusOwnerController.js` creates new bus-owner users with `status: "active"` and `forcePasswordChange: true`, so this activation endpoint should not be documented as currently handling those active admin-created bus owners.

## Safe extension guidance

If this flow is modularized or expanded, first add characterization tests for current invited-only behavior, OTP purpose, password hashing, save/revoke/generate order, and cookie-only refresh token delivery.

## Verification references

- Base branch: `dev`
- Verified commit: `17175676a11842f66fb28c96e4bf54bb37a0d262`
- Mount: `routes/indexRoute.js`
- Routes: `routes/authRoutes/activateAuthRoutes.js`
- Entry point: `controllers/authControllers.js/activateAccountController.js`
- Implementation:
  - `controllers/authControllers.js/activateAccountController.js`
  - `controllers/adminController/busOwnerController/adminBusOwnerController.js`
  - `src/modules/auth/login/login.policy.js`
- Middleware:
  - `middleware/otpRateLimiter.js`
- Models/utilities inspected:
  - `models/userModel.js`
  - `models/otpModel.js`
  - `models/refreshTokenModel.js`
  - `utils/otpHelper.js`
  - `utils/passwordValidator.js`
  - `utils/tokenService.js`
- Characterization tests inspected:
  - `tests/characterization/auth-login.test.js`
- Unit tests inspected:
  - Not applicable — no activation-specific unit test was found
- Validation command: `npm run test:auth`
