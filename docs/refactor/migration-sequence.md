# Migration Sequence
**Branch:** `refactor/foundation`  
**Commit:** `df5a7f2`  
**Generated:** 2026-07-16

> Each item below represents one pull request against **`dev`**. No PR should attempt the complete backend refactor.  
> All PRs during the refactor must: (a) keep existing API paths unchanged, (b) keep collection/field names unchanged, (c) pass CI before merge.  
> **Rule:** No utility file may be relocated before the characterization tests required by its consuming PR are passing.

---

## PR-0 — Baseline Documentation

**Scope:** Create the `docs/refactor/` documentation suite, `config/refactor-file-size-baseline.json`, and update `.gitignore`.

**Files affected:** `docs/refactor/*.md`, `config/refactor-file-size-baseline.json`

**Target branch:** `dev`

**Tests required first:** None (documentation only)

**API contracts unchanged:** Yes — no production code touched

**Risks:** None

**Rollback:** Delete the docs directory

**Complexity:** Small ✅ *(This PR)*

---

## PR-1 — Test and CI Foundation

**Scope:** Wire the test runner, write the first characterization tests, and add the GitHub Actions gate. No production code is moved or altered. This PR must land before any `require()` paths change.

**Files affected:**
```
package.json                         (add jest, supertest, mongodb-memory-server as devDependencies)
.github/workflows/test.yml           (new — CI gate on dev branch)
tests/characterization/auth.test.js  (new — POST /api/login 200/401, POST /api/refresh, POST /api/logout)
tests/characterization/search.test.js (new — POST /api/public/searchTrips happy path)
```

**Target branch:** `dev`

**Tests required first:** None (this PR IS the tests)

**API contracts unchanged:** Yes — no production code touched

**Risks:** Low — only devDependencies and test files added

**Rollback:** Revert package.json and delete test files

**Complexity:** Small

---

## PR-2 — Shared HTTP and Error Foundation

**Scope:** Add `asyncHandler` (async error wrapper) and a unified `respond(res, status, body)` helper as a new `src/shared/` layer. These files have **zero Mongoose model imports** — they are safe to create without prior tests.

**Files affected:**
```
src/shared/asyncHandler.js  (new — wraps async route handlers; no model imports)
src/shared/respond.js       (new — standardises JSON response shape; no model imports)
```

**Target branch:** `dev`

**Tests required first:** None (pure functions with no dependencies)

**API contracts unchanged:** Yes — no existing file is moved or modified

**Risks:** Low — additive only; existing controllers are not yet updated to use these helpers

**Rollback:** Delete the two new files

**Complexity:** Small

---

## PR-3 — User Login: Characterize then Extract

**Scope:** Two steps in one PR:
1. Add a characterization test for `POST /api/login` (must pass before the move).
2. Extract the `login` handler from `authController.js` into its own single-use-case file.

No broad `loginController.js` that bundles multiple operations — one file, one use case.

**Files affected:**
```
tests/characterization/auth.test.js              (add login cases if not already covered by PR-1)
controllers/authControllers.js/authController.js (remove login handler)
src/modules/auth/user.login.js                   (new — single use case: POST /api/login)
routes/userRoutes/userRoutes.js                  (update require to new path)
```

**Target branch:** `dev`

**Tests required first:**
- `POST /api/login` → 200 with valid credentials
- `POST /api/login` → 401 with wrong password
- `POST /api/login` → rate limited after 10 attempts

**API contracts unchanged:** `POST /api/login` must return identical response shape

**Risks:** Medium — login is the most used endpoint

**Rollback:** Revert controller require in userRoutes

**Complexity:** Small

---

## PR-4 — Session and Token Lifecycle

**Scope:** Extract `refreshAccessToken` and `logout` from `authController.js`. Token issue and refresh-token rotation code belongs under `auth/sessions`, not in a shared utility. These handlers depend on `refreshTokenModel` and must stay within the auth module boundary.

**Files affected:**
```
controllers/authControllers.js/authController.js  (remove refresh + logout handlers)
src/modules/auth/sessions/user.refresh.js         (new — single use case: POST /api/refresh)
src/modules/auth/sessions/user.logout.js          (new — single use case: POST /api/logout)
routes/userRoutes/userRoutes.js                   (update requires)
```

**Target branch:** `dev`

**Tests required first:**
- `POST /api/refresh` returns new access token with valid refresh token
- `POST /api/refresh` returns 401 with expired refresh token
- `POST /api/logout` returns 200; subsequent `POST /api/refresh` returns 401

**API contracts unchanged:** Yes

**Risks:** Medium — token rotation failure logs out all users

**Rollback:** Revert requires in userRoutes

**Complexity:** Small

## PR-5 — User Registration: Characterize then Extract

**Scope:** Extract the 3-step registration flow from `authController.js`. Phone-registration guard (`phoneGuard.js`) belongs under `auth/registration` (or `users/identity`) — it depends on `userModel`, `agentModel`, and `busOwnerModel` and must not be placed in the infrastructure shared layer which has zero model imports.

Each extracted handler is one file, one use case:

**Files affected:**
```
controllers/authControllers.js/authController.js  (remove registration handlers)
src/modules/auth/registration/user.sendPhoneOTP.js      (new)
src/modules/auth/registration/user.verifyPhoneOTP.js    (new)
src/modules/auth/registration/user.completeRegistration.js (new)
src/modules/auth/registration/user.resendOTP.js         (new)
routes/userRoutes/userRoutes.js
```

**Target branch:** `dev`

**Tests required first:**
- Full registration flow: sendOTP → verifyOTP → complete (happy path)
- Duplicate phone blocked
- OTP expiry rejected
- OTP purpose mismatch rejected

**API contracts unchanged:** Yes — all three POST paths unchanged

**Risks:** High — registration is the new-user acquisition funnel

**Rollback:** Revert controller require in route

**Complexity:** Medium

---

## PR-6 — OTP Infrastructure Extraction

**Scope:** Move OTP generation and verification logic into `src/modules/auth/otp/`. OTP code belongs under `auth/otp` — not in the shared infrastructure layer, because `otpHelper.js` imports `otpModel` (a domain Mongoose model). Shared infrastructure must import no domain models.

**Files affected:**
```
utils/otpHelper.js          → src/modules/auth/otp/otpHelper.js
middleware/otpRateLimiter.js → src/modules/auth/otp/otpRateLimiter.js
utils/enumGuard.js          → src/modules/auth/otp/enumGuard.js
utils/verificationToken.js  → src/modules/auth/otp/verificationToken.js
```

**All callers** (authController, agentAuthController, busOwnerAuthController) updated.

**Target branch:** `dev`

**Tests required first:**
- OTP flow end-to-end (sendOTP → verifyOTP)
- Rate limiter blocks after threshold
- OTP purpose mismatch rejected

**API contracts unchanged:** Yes

**Risks:** Medium — OTP is used across three auth flows

**Rollback:** Revert require paths

**Complexity:** Small

---

## PR-7 — Password Recovery Flow

**Scope:** Extract `requestPasswordReset`, `verifyOtpForReset`, `resetPassword` from `authController.js`. Each handler gets its own file.

**Files affected:**
```
controllers/authControllers.js/authController.js          (remove password reset handlers)
src/modules/auth/password/user.requestPasswordReset.js    (new)
src/modules/auth/password/user.verifyOtpForReset.js       (new)
src/modules/auth/password/user.resetPassword.js           (new)
routes/userRoutes/userRoutes.js
```

**Target branch:** `dev`

**Tests required first:**
- Reset flow: requestReset → verifyOTP → resetPassword (happy path)
- Wrong OTP rejected
- Expired OTP rejected

**API contracts unchanged:** Yes

**Risks:** Medium

**Complexity:** Small

---

## PR-8 — User Profile and Force Password Change

**Scope:** Extract `getUserDetail`, `updateProfile`, `UpdateProfilePic`, `updatePassword`, `changeForcePassword`. Phone uniqueness guard (`phoneGuard.js`) stays inside `auth/registration` or `users/identity` — not in shared infrastructure. `authController.js` should be empty or near-empty after PRs 3–8.

**Files affected:**
```
controllers/authControllers.js/authController.js   (extract remaining profile handlers)
src/modules/users/profile/user.getProfile.js       (new)
src/modules/users/profile/user.updateProfile.js    (new)
src/modules/users/profile/user.updatePassword.js   (new)
src/modules/users/profile/user.changeForcePassword.js (new)
routes/userRoutes/userRoutes.js
```

**Target branch:** `dev`

**Tests required first:**
- `GET /api/getUserDetail` returns correct user shape
- `PATCH /api/updateProfile` updates and returns updated user

**API contracts unchanged:** Yes

**Risks:** Low

**Complexity:** Small

---

## PR-9 — Admin Authentication and MFA

**Scope:** Isolate admin auth into `src/modules/admin/auth/`. One file per use case. This must not be confused with any `User` model role-check flow — admin auth uses the dedicated `SuperAdmin` collection exclusively.

**Files affected:**
```
controllers/adminController/authController/auth-controller.js  → split into:
  src/modules/admin/auth/admin.login.js          (new — POST /api/admin/auth/login)
  src/modules/admin/auth/admin.verifyMfa.js      (new — POST /api/admin/auth/verify-2fa)
  src/modules/admin/auth/admin.setupMfa.js       (new — POST /api/admin/auth/setup-2fa)
  src/modules/admin/auth/admin.refresh.js        (new — POST /api/admin/auth/refresh)
  src/modules/admin/auth/admin.logout.js         (new — POST /api/admin/auth/logout)
  src/modules/admin/auth/admin.changePassword.js (new — POST /api/admin/auth/change-password)
routes/adminRoutes/adminRoutes.js  (admin auth portion)
```

**Target branch:** `dev`

**Tests required first:**
- Admin login → 200 with valid credentials, 30-min JWT issued
- Admin login with 2FA → `mfaRequired` response + tempToken
- `verify-2fa` → full JWT on valid TOTP
- Protected admin route → 401 without admin token

**API contracts unchanged:** All `/api/admin/auth/*` paths unchanged

**Security findings related:** MFA flow must not regress

**Risks:** High — admin auth failure locks all admin operations

**Rollback:** Revert require paths in admin routes

**Complexity:** Medium

---

## PR-10 — Agent Onboarding (Auth + KYC)

**Scope:** Split `agentAuthController.js` (986 lines) into separate single-use-case handlers following the same pattern as PRs 3–8.

**Files affected:**
```
controllers/authControllers.js/agentAuthController.js  (decompose)
src/modules/agents/auth/agent.login.js
src/modules/agents/auth/agent.sendOTP.js
src/modules/agents/auth/agent.verifyOTP.js
src/modules/agents/auth/agent.register.js
src/modules/agents/auth/agent.logout.js
src/modules/agents/auth/agent.refresh.js
src/modules/agents/auth/agent.requestPasswordReset.js
src/modules/agents/auth/agent.resetPassword.js
routes/authRoutes/agentAuthRoutes.js
```

**Target branch:** `dev`

**Tests required first:**
- Agent registration flow end-to-end
- Agent login
- Agent logout

**API contracts unchanged:** All `/api/auth/agent/*` paths unchanged

**Risks:** High — agents are a primary revenue source for some operators

**Rollback:** Revert route requires

**Complexity:** Large

---

## PR-11 — Bus Owner Onboarding (Auth + KYC)

**Scope:** Same single-use-case split as PR-10 but for `busOwnerAuthController.js` (914 lines).

**Files affected:**
```
controllers/authControllers.js/busOwnerAuthController.js  (decompose)
src/modules/operators/auth/operator.login.js
src/modules/operators/auth/operator.sendOTP.js
src/modules/operators/auth/operator.verifyOTP.js
src/modules/operators/auth/operator.register.js
src/modules/operators/auth/operator.logout.js
src/modules/operators/auth/operator.refresh.js
src/modules/operators/auth/operator.requestPasswordReset.js
src/modules/operators/auth/operator.resetPassword.js
routes/authRoutes/busOwnerAuthRoutes.js
```

**Target branch:** `dev`

**Tests required first:** Bus owner registration + login flow

**API contracts unchanged:** All `/api/auth/busowner/*` paths unchanged

**Risks:** High — supply-side (operators) affects all passenger bookings

**Rollback:** Revert route requires

**Complexity:** Large

---

## PR-12 — KYC (Admin review for agents and bus owners)

**Scope:** Move KYC review controllers into `src/modules/kyc/`. No logic changes.

**Files affected:**
```
controllers/adminController/adminAgentController/   → src/modules/kyc/agentKycController.js
controllers/adminController/busOwnerController/adminBusOwnerController.js → src/modules/admin/bus-owner-management/
controllers/adminController/documentProxyController.js → src/modules/kyc/documentProxyController.js
routes/adminRoutes/adminRoutes.js  (kyc portion)
```

**Tests required first:**
- Agent approval changes verificationStatus
- Bus owner rejection changes verificationStatus
- Document proxy returns binary stream

**API contracts unchanged:** Yes

**Risks:** Medium

**Complexity:** Medium

---

## PR-13 — Fleets and Amenities

**Scope:** Move fleet controller, fleet service, and amenities into their own modules.

**Files affected:**
```
services/fleetService.js  → src/modules/fleets/fleetService.js
controllers/adminController/fleetWorkstationController.js → src/modules/fleets/
controllers/busOwnerController/busOwnerController.js  (fleet + amenities portions)
routes/busOwner/busOwner.js  (fleet + amenities portion)
```

**Tests required first:**
- Fleet submission returns pending status
- Fleet approval changes status

**API contracts unchanged:** Yes

**Risks:** Medium

**Complexity:** Medium

---

## PR-14 — Stops, Boarding Points and Routes

**Scope:** Extract platform registry (stops, boarding points) and bus route management.

**Files affected:**
```
services/platformRegistryService.js → src/modules/stops/
controllers/adminController/platformRegistryController.js → src/modules/stops/
controllers/public/stopSearchController.js → src/modules/stops/
controllers/busOwnerController/busOwnerRouteController.js → src/modules/routes/
routes/publicRoutes/publicRoute.js  (stop search portion)
routes/adminRoutes/adminRoutes.js   (registry portion)
routes/busOwner/busOwner.js         (route portion)
```

**Tests required first:**
- Stop search returns results
- `POST /api/public/searchTrips` still works (no regression)

**API contracts unchanged:** Yes

**Risks:** Medium — stop search is a public, high-traffic endpoint

**Complexity:** Large

---

## PR-15 — Trips, Schedules and Cron

**Scope:** Move trip and schedule controllers + services into `src/modules/trips/`. Split `tripGeneratorCron.js` — separate the cron scheduler wrapper from the trip generation business logic.

**Files affected:**
```
services/scheduleService.js     → src/modules/admin/schedule-management/ (completed)
services/tripService.js         → src/modules/trips/tripService.js
services/tripGeneratorCron.js   → src/modules/trips/tripGeneratorCron.js
                                   src/modules/trips/tripGenerationService.js  (logic extracted)
services/tripExceptionService.js → src/modules/trips/tripExceptionService.js
controllers/adminController/scheduleController.js → src/modules/admin/schedule-management/ (completed)
controllers/adminController/tripExceptionController.js → src/modules/trips/
controllers/adminController/tripOverviewController.js → src/modules/admin/trip-overview/ (completed)
```

**Tests required first:**
- Schedule creation returns DRAFT
- Schedule go-live triggers burst generation
- searchTrips still returns results

**API contracts unchanged:** Yes

**Risks:** High — trip generation cron failure means no future trips

**Rollback:** Keep original cron file alongside new one; cut over atomically

**Complexity:** Large

---

## PR-16 — Seat Holds

**Scope:** Extract seat-hold logic from `paymentBookingController.js` into `src/modules/seat-holds/seatHoldService.js`.

**Tests required first:**
- `POST /api/ticket/prepareBooking` creates a seat hold

**API contracts unchanged:** Yes

**Risks:** High — holds feed directly into payment flow

**Complexity:** Medium

---

## PR-17 — Bookings (Core Booking Logic)

**Scope:** Extract booking creation, history, YatraPoints from `ticketController.js` (2,109 lines).

This is the most complex extraction in the codebase. Must be done after PR-16.

**Files affected:**
```
controllers/ticketController/ticketController.js  (extract booking portion)
src/modules/bookings/bookingController.js
src/modules/bookings/bookingService.js
```

**Tests required first:**
- `GET /api/ticket/getMyTicketHistory` returns correct shape
- `POST /api/ticket/bookTicket` (legacy) still works
- YatraPoints recorded correctly after booking

**API contracts unchanged:** Yes

**Risks:** Critical — booking is the core revenue flow

**Rollback:** Keep original controller alongside; swap route registration

**Complexity:** Large

---

## PR-18 — Payments and Ticket Confirmation

**Scope:** Extract payment controller into `src/modules/payments/` and delegate S3, wallet, notification calls to their respective modules.

**Files affected:**
```
controllers/ticketController/paymentBookingController.js  (split by responsibility)
src/modules/payments/esewaController.js
src/modules/payments/esewaService.js
services/esewaVerificationService.js → src/modules/payments/
```

**Tests required first:**
- `POST /api/ticket/prepareBooking` returns valid eSewa payload
- `POST /api/ticket/confirmBooking` confirms booking on valid eSewa response
- Wallet credit occurs on successful booking

**API contracts unchanged:** Yes

**Risks:** Critical — payment failure means lost revenue

**Rollback:** Revert route to original controller

**Complexity:** Large

---

## PR-19 — Cancellations and Refunds

**Scope:** Extract cancel and refund flows from `ticketController.js` and admin refund controller.

**Files affected:**
```
controllers/ticketController/ticketController.js  (cancel portion)
src/modules/cancellations/cancellationController.js
src/modules/refunds/refundController.js
services/refundCalculatorService.js → src/modules/refunds/
```

**Tests required first:**
- `POST /api/ticket/cancelEstimate` returns correct breakdown
- `POST /api/ticket/cancelTicket` changes booking status
- Admin refund approval credits wallet

**API contracts unchanged:** Yes

**Risks:** High — refund failures destroy passenger trust

**Complexity:** Medium

---

## PR-20 — Wallet and Ledger

**Scope:** Move wallet service, SM Ledger service, scratch cards into `src/modules/wallet/`. Split SM Ledger from wallet.

**Files affected:**
```
services/walletService.js     → src/modules/wallet/walletService.js
services/smLedgerService.js   → src/modules/wallet/smLedgerService.js
controllers/walletController/ → src/modules/wallet/
controllers/adminController/walletController/ → src/modules/wallet/admin/
```

**Tests required first:**
- Wallet balance changes on credit
- SM Ledger entry created for every wallet event

**API contracts unchanged:** Yes

**Risks:** High — financial operations, reconciliation depends on ledger

**Complexity:** Large

---

## PR-21 — Coupons and Referrals

**Scope:** Move coupon and referral modules cleanly.

**Tests required first:**
- `POST /api/coupons/validate` returns correct discount amount
- Referral reward credited after first booking

**API contracts unchanged:** Yes

**Risks:** Medium

**Complexity:** Medium

---

## PR-22 — Settlements

**Scope:** Move settlement controllers and financial service into `src/modules/settlements/`.

**Tests required first:**
- Settlement raise records correctly

**API contracts unchanged:** Yes

**Risks:** Medium

**Complexity:** Small

---

## PR-23 — Notifications and Audit Logging

**Scope:** Create a unified `notifications` module. Decouple all inline email/push/SMS calls from business controllers — replace with `notify(userId, event, data)` calls.

**Files affected:**
- All controllers currently calling `emailManager`, `sparro-otp`, Firebase directly
- `controllers/notificationController/` → `src/modules/notifications/`
- New: `src/modules/audit/auditService.js`

**Tests required first:**
- Booking confirmation email sent after `confirmBooking`
- KYC approval email sent after admin approval

**API contracts unchanged:** Yes — notifications are side effects, not API responses

**Risks:** Medium — missed notification is a UX defect not a data defect

**Complexity:** Large

---

## PR-24 — Admin Sub-Router Split

**Scope:** Split `routes/adminRoutes/adminRoutes.js` (466 lines) into per-domain sub-routers.

```
routes/adminRoutes/
  auth.routes.js
  kyc.routes.js
  fleet.routes.js
  route.routes.js
  trip.routes.js
  booking.routes.js
  payment.routes.js
  refund.routes.js
  wallet.routes.js
  coupon.routes.js
  settlement.routes.js
  notification.routes.js
  platform.routes.js
  index.js  (assembles all sub-routers)
```

**Tests required first:** All admin endpoint smoke tests

**API contracts unchanged:** All `/api/admin/*` paths unchanged

**Risks:** Medium — route registration order matters

**Complexity:** Medium

---

## Sequence Summary

| PR | Name | Target | Complexity | Risk | Dependency |
|---|---|---|---|---|---|
| PR-0 | Docs baseline | `dev` | Small | None | — |
| PR-1 | Test and CI foundation | `dev` | Small | Low | — |
| PR-2 | Shared HTTP/error foundation | `dev` | Small | Low | — |
| PR-3 | User login: characterize + extract | `dev` | Small | Medium | PR-1 |
| PR-4 | Session and token lifecycle | `dev` | Small | Medium | PR-3 |
| PR-5 | Registration: characterize + extract | `dev` | Medium | High | PR-4 |
| PR-6 | OTP infrastructure extraction | `dev` | Small | Medium | PR-5 |
| PR-7 | Password recovery flow | `dev` | Small | Medium | PR-6 |
| PR-8 | User profile | `dev` | Small | Low | PR-7 |
| PR-9 | Admin auth + MFA (SuperAdmin model) | `dev` | Medium | High | PR-1 |
| PR-10 | Agent onboarding | `dev` | Large | High | PR-6 |
| PR-11 | Bus owner onboarding | `dev` | Large | High | PR-6 |
| PR-12 | KYC review | `dev` | Medium | Medium | PR-10, PR-11 |
| PR-13 | Fleets + amenities | `dev` | Medium | Medium | PR-11 |
| PR-14 | Stops + routes | `dev` | Large | Medium | PR-13 |
| PR-15 | Trips + schedules + cron | `dev` | Large | High | PR-14 |
| PR-16 | Seat holds | `dev` | Medium | High | PR-15 |
| PR-17 | Bookings | `dev` | Large | Critical | PR-16 |
| PR-18 | Payments + ticket confirm | `dev` | Large | Critical | PR-17 |
| PR-19 | Cancellations + refunds | `dev` | Medium | High | PR-18 |
| PR-20 | Wallet + ledger | `dev` | Large | High | PR-19 |
| PR-21 | Coupons + referrals | `dev` | Medium | Medium | PR-20 |
| PR-22 | Settlements | `dev` | Small | Medium | PR-20 |
| PR-23 | Notifications + audit | `dev` | Large | Medium | All |
| PR-24 | Admin sub-router split | `dev` | Medium | Medium | All |
