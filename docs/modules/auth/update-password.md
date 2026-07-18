# Update password

[Back to general authentication](README.md)

Related: [password reset](password-reset.md) and [force password](force-password.md).

## Purpose

Update password is the voluntary authenticated password-change flow for a signed-in user.

## Who uses it

Authenticated general users calling `/api/updatePassword`.

## Responsibilities

- Require a valid access token and DB-backed authorization middleware.
- Validate current and new passwords.
- Track wrong-current-password attempts.
- Lock the account and increment `tokenVersion` at the threshold.
- Replace the password and revoke refresh tokens after a successful update.

## What this module does not do

- It does not recover forgotten passwords.
- It does not issue replacement access or refresh tokens.
- It does not set or clear cookies.

## Public endpoints

| Method | Full path | Middleware in order | Handler |
|---|---|---|---|
| PUT | `/api/updatePassword` | `auth`, `passwordChangeLimiter`, `verifyRoleFromDB` | `updatePasswordModule.updatePassword` |

## Request and response walkthrough

The controller reads `req.userInfo?.id`, `oldPassword`, and `newPassword`. Missing user ID returns `401` with `status: false`. Missing either password returns `400`. New password validation happens before database lookup.

The repository loads `User.findById(userId).select("+password")`. Missing user returns `404`. The old password is compared first. If incorrect, the repository performs one aggregation-pipeline `findByIdAndUpdate` that increments `failedLoginAttempts` and conditionally sets `lockedUntil` and increments `tokenVersion` when the count reaches five. No refresh-token revocation happens in this wrong-password branch.

If the old password is correct, failed state is cleared only when `failedLoginAttempts > 0 || lockedUntil`. The module then rejects same-password updates, hashes the new password with cost `12`, updates only `password` through `findByIdAndUpdate`, revokes all refresh tokens, and returns `200`.

## Flow walkthrough

1. Require authenticated user.
2. Require both passwords.
3. Validate new password strength.
4. Find user with password.
5. Compare old password.
6. Wrong password: record failed attempt atomically and stop.
7. Correct password: optionally clear failed state.
8. Compare new password to current hash.
9. Hash, update password, revoke refresh tokens, return success.

## Authentication or ownership proof

The operation is authorized by an access token accepted by `auth`, DB checks in `verifyRoleFromDB`, and knowledge of the current password.

## Data read and changed

| Model/document | Reads | Changes |
|---|---|---|
| `User` | `_id`, `password`, `failedLoginAttempts`, `lockedUntil` | Wrong current password increments `failedLoginAttempts`; threshold sets `lockedUntil` and increments `tokenVersion`; successful path may clear failed state and updates `password`. |
| `RefreshToken` | None directly | Successful password update deletes all user refresh tokens. |

## Dependencies

- `authMiddleware` verifies access-token purpose.
- `verifyRoleFromDB` checks account state, role drift, `tokenVersion`, and force-password state.
- `passwordChangeLimiter` rate-limits this route.
- `passwordValidator`, `bcryptjs`, and `tokenService.revokeAllUserTokens` perform validation, hashing, and revocation.

## Security-sensitive behavior

- Validation occurs before database lookup.
- Wrong-password response uses `success: false`; other expected failures use `status: false`.
- Threshold lock does not call refresh-token revocation, despite the message saying sessions are revoked.
- Successful revocation happens only after password update.

## Tests

Characterization tests cover errors, success, failed-attempt counters, lock behavior, tokenVersion increment, and preservation of refresh tokens on lock. Unit tests cover controller DTOs, repository query shape, ordering, and failure mapping.

## Known limitations or inconsistencies

The wrong-password and lock responses use `success: false`, while other failures use `status: false`. The lock message says sessions are revoked, but the current wrong-password branch does not call `revokeAllUserTokens`; tests preserve that legacy behavior.

## Safe extension guidance

Before changing this module, verify middleware order, aggregation-pipeline update shape, lock threshold semantics, successful update/revoke order, and response-field inconsistencies.

## Verification references

- Base branch: `dev`
- Verified commit: `17175676a11842f66fb28c96e4bf54bb37a0d262`
- Mount: `routes/indexRoute.js`
- Routes: `routes/userRoutes/userRoutes.js`
- Entry point: `src/modules/auth/update-password/index.js`
- Implementation:
  - `src/modules/auth/update-password/update-password.controller.js`
  - `src/modules/auth/update-password/update-password.service.js`
  - `src/modules/auth/update-password/update-password.repository.js`
  - `src/modules/auth/update-password/update-password.policy.js`
  - `src/modules/auth/update-password/update-password.errors.js`
- Middleware:
  - `middleware/authMiddleware.js`
  - `middleware/verifyRoleFromDB.js`
  - `passwordChangeLimiter` in `routes/userRoutes/userRoutes.js`
- Models/utilities inspected:
  - `models/userModel.js`
  - `models/refreshTokenModel.js`
  - `utils/passwordValidator.js`
  - `utils/tokenService.js`
- Characterization tests inspected:
  - `tests/characterization/auth-update-password-errors.test.js`
  - `tests/characterization/auth-update-password-success.test.js`
  - `tests/characterization/auth-update-password-attempts.test.js`
- Unit tests inspected:
  - `tests/unit/auth/update-password-controller.test.js`
  - `tests/unit/auth/update-password-service.test.js`
  - `tests/unit/auth/update-password-attempts.test.js`
  - `tests/unit/auth/update-password-failures.test.js`
  - `tests/unit/auth/update-password-order.test.js`
  - `tests/unit/auth/update-password-repository.test.js`
- Validation command: `npm run test:update-password`
