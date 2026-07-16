# Migration Sequence
**Branch:** `refactor/foundation`  
**Commit:** `df5a7f2`  
**Generated:** 2026-07-16

> Each item below represents one pull request against `dev`. No PR should attempt the complete backend refactor.  
> All PRs during the refactor must: (a) keep existing API paths unchanged, (b) keep collection/field names unchanged, (c) pass CI before merge.

---

## PR-0 — Shared Foundation (This document's parent)

**Scope:** Create the `docs/refactor/` documentation suite, `config/refactor-file-size-baseline.json`, and update `.gitignore`.

**Files affected:** `docs/refactor/*.md`, `config/refactor-file-size-baseline.json`, `.gitignore`

**Tests required first:** None (documentation only)

**API contracts unchanged:** Yes — no production code touched

**Risks:** None

**Rollback:** Delete the docs directory

**Complexity:** Small ✅ *(This PR)*

---

## PR-1 — Shared Infrastructure Package

**Scope:** Extract all pure utility functions into a stable shared layer. Move files without changing their exports or internal logic. Every consumer `require()` path is updated to point at the new location.

**Files to move:**
```
utils/logger.js             → src/shared/logger.js
utils/server.js             → src/shared/server.js
utils/passwordValidator.js  → src/shared/passwordValidator.js
middleware/requestLogger.js → src/shared/requestLogger.js
db/db.js                    → src/shared/db.js
```

**Files NOT moved yet** (have active coupling — move in later PRs):
```
utils/otpHelper.js         (depends on otpModel — move with PR-3)
utils/tokenService.js      (depends on refreshTokenModel — move with PR-2)
utils/phoneGuard.js        (depends on userModel — move with PR-2)
utils/enumGuard.js         (move with PR-3)
utils/verificationToken.js (move with PR-3)
emailManager/emailManager.js + handlers/ (move with PR-20)
```

**Tests required first:** None (pure infrastructure — no business logic)

**API contracts unchanged:** Yes

**Risks:** Low — updating require paths can introduce typos

**Rollback:** Revert the file moves; all old paths are known

**Complexity:** Small

---

## PR-2 — Auth Middleware and Token Service

**Scope:** Extract `tokenService`, `authMiddleware`, and `verifyRoleFromDB` as a self-contained auth layer. No controller splitting yet — only move the middleware files and token utilities.

**Files affected:**
```
utils/tokenService.js         → src/shared/tokenService.js
middleware/authMiddleware.js  → src/shared/authMiddleware.js
middleware/verifyRoleFromDB.js → src/shared/verifyRoleFromDB.js
middleware/adminMiddleware.js  → src/shared/adminMiddleware.js
```

**All route files updated** to `require` from new paths.

**Tests required first:**
- Characterization test: `POST /api/login` returns 200 with valid credentials
- Characterization test: protected route returns 401 without token
- Characterization test: protected route returns 401 with expired token

**API contracts unchanged:** Yes

**Security findings related:** AUTH-01, NF-01, NF-04 (existing fixes already in place — must not regress)

**Risks:** Medium — authMiddleware is used on almost every route; a wrong require path breaks all protected endpoints

**Rollback:** Revert require paths to original utils/middleware paths

**Complexity:** Medium

---

## PR-3 — OTP and Phone Guard Utilities

**Scope:** Move OTP helper, phone guard, enumGuard, and verificationToken into shared. No logic changes.

**Files affected:**
```
utils/otpHelper.js          → src/shared/otpHelper.js
utils/phoneGuard.js         → src/shared/phoneGuard.js
utils/enumGuard.js          → src/shared/enumGuard.js
utils/verificationToken.js  → src/shared/verificationToken.js
middleware/otpRateLimiter.js → src/shared/otpRateLimiter.js
middleware/checkRole.js      → src/shared/checkRole.js
middleware/autoGenerateReferralCode.js → src/shared/autoGenerateReferralCode.js
middleware/requireApprovedAgent.js     → src/shared/requireApprovedAgent.js
middleware/requireApprovedBusOwner.js  → src/shared/requireApprovedBusOwner.js
```

**Tests required first:**
- Characterization test: OTP flow end-to-end (sendOTP → verifyOTP)
- Characterization test: Rate limiter blocks after threshold

**API contracts unchanged:** Yes

**Risks:** Low — utilities with well-defined inputs/outputs

**Rollback:** Revert require paths

**Complexity:** Small

---

## PR-4 — User Login Flow (Extract from authController)

**Scope:** Extract the `login` handler from `authController.js` into its own file `src/modules/auth/loginController.js`. No logic changes. The route still calls the same function through the same path.

**Files affected:**
```
controllers/authControllers.js/authController.js  (remove login handler)
src/modules/auth/loginController.js               (new — extracted login handler)
routes/userRoutes/userRoutes.js                   (update require)
```

**Tests required first:**
- `POST /api/login` → 200 with valid credentials
- `POST /api/login` → 401 with wrong password
- `POST /api/login` → rate limited after 10 attempts

**API contracts unchanged:** `POST /api/login` must return identical response shape

**Risks:** Medium — login is the most used endpoint

**Rollback:** Revert controller require in userRoutes

**Complexity:** Small

---

## PR-5 — Session and Token Lifecycle

**Scope:** Extract `refreshAccessToken` and `logout` from `authController.js`.

**Files affected:**
```
controllers/authControllers.js/authController.js  (remove refresh/logout)
src/modules/auth/sessionController.js             (new)
routes/userRoutes/userRoutes.js                   (update require)
```

**Tests required first:**
- `POST /api/refresh` returns new access token
- `POST /api/logout` returns 200, subsequent refresh fails

**API contracts unchanged:** Yes

**Risks:** Low

**Complexity:** Small

---

## PR-6 — Registration and OTP Flow

**Scope:** Extract `sendPhoneOTP`, `verifyPhoneOTP`, `completeRegistration`, and `resendOtp` from `authController.js`.

**Files affected:**
```
controllers/authControllers.js/authController.js  (remove registration handlers)
src/modules/auth/registrationController.js         (new)
routes/userRoutes/userRoutes.js
```

**Tests required first:**
- Full registration flow: sendOTP → verifyOTP → complete (happy path)
- Duplicate phone blocked
- OTP expiry rejected

**API contracts unchanged:** Yes — all three POST paths unchanged

**Risks:** High — registration is the new-user acquisition funnel

**Rollback:** Revert controller require in route

**Complexity:** Medium

---

## PR-7 — Password Recovery Flow

**Scope:** Extract `requestPasswordReset`, `verifyOtpForReset`, `resetPassword` from `authController.js`.

**Files affected:**
```
controllers/authControllers.js/authController.js  (remove password reset handlers)
src/modules/auth/passwordResetController.js        (new)
routes/userRoutes/userRoutes.js
```

**Tests required first:**
- Reset flow: requestReset → verifyOTP → resetPassword (happy path)
- Wrong OTP rejected
- Expired OTP rejected

**API contracts unchanged:** Yes

**Risks:** Medium

**Complexity:** Small

---

## PR-8 — User Profile and Force Password Change

**Scope:** Extract `getUserDetail`, `updateProfile`, `UpdateProfilePic`, `updatePassword`, `changeForcePassword`.

**Files:** Remaining auth controller → `src/modules/users/profileController.js`

`authController.js` should now be empty or near-empty after PRs 4–8.

**Tests required first:**
- `GET /api/getUserDetail` returns correct user shape
- `PATCH /api/updateProfile` updates and returns updated user

**API contracts unchanged:** Yes

**Risks:** Low

**Complexity:** Small

---

## PR-9 — Admin Authentication and MFA

**Scope:** Isolate admin auth into `src/modules/admin/auth/adminAuthController.js`. No changes to `adminMiddleware`.

**Files affected:**
```
controllers/adminController/authController/auth-controller.js → move to src/modules/admin/auth/
routes/adminRoutes/adminRoutes.js  (admin auth portion)
```

**Tests required first:**
- Admin login → 200 with valid credentials
- Admin login with 2FA → mfaRequired response
- verify-2fa → full JWT on valid TOTP

**API contracts unchanged:** All `/api/admin/auth/*` paths unchanged

**Security findings related:** MFA flow must not regress

**Risks:** High — admin auth failure locks all admin operations

**Rollback:** Revert require paths in admin routes

**Complexity:** Medium

---

## PR-10 — Agent Onboarding (Auth + KYC)

**Scope:** Split `agentAuthController.js` (986 lines) into separate handlers following the same pattern as PRs 4–8.

**Files affected:**
```
controllers/authControllers.js/agentAuthController.js  (decompose into ≤4 files)
src/modules/agents/auth/agentLoginController.js
src/modules/agents/auth/agentRegistrationController.js
src/modules/agents/auth/agentPasswordResetController.js
src/modules/agents/auth/agentSessionController.js
routes/authRoutes/agentAuthRoutes.js
```

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

**Scope:** Same split as PR-10 but for `busOwnerAuthController.js` (914 lines).

**Files affected:**
```
controllers/authControllers.js/busOwnerAuthController.js  (decompose)
src/modules/operators/auth/
routes/authRoutes/busOwnerAuthRoutes.js
```

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
controllers/adminController/busOwnerController/adminBusOwnerController.js → src/modules/kyc/operatorKycController.js
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
services/scheduleService.js     → src/modules/trips/scheduleService.js
services/tripService.js         → src/modules/trips/tripService.js
services/tripGeneratorCron.js   → src/modules/trips/tripGeneratorCron.js
                                   src/modules/trips/tripGenerationService.js  (logic extracted)
services/tripExceptionService.js → src/modules/trips/tripExceptionService.js
controllers/adminController/scheduleController.js → src/modules/trips/
controllers/adminController/tripExceptionController.js → src/modules/trips/
controllers/adminController/tripOverviewController.js → src/modules/trips/ (split if possible)
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

| PR | Name | Complexity | Risk | Dependency |
|---|---|---|---|---|
| PR-0 | Docs baseline | Small | None | — |
| PR-1 | Shared infrastructure | Small | Low | — |
| PR-2 | Auth middleware + token | Medium | Medium | PR-1 |
| PR-3 | OTP + phone guard utilities | Small | Low | PR-2 |
| PR-4 | User login | Small | Medium | PR-3 |
| PR-5 | Session / token lifecycle | Small | Low | PR-4 |
| PR-6 | Registration + OTP | Medium | High | PR-5 |
| PR-7 | Password recovery | Small | Medium | PR-6 |
| PR-8 | User profile | Small | Low | PR-7 |
| PR-9 | Admin auth + MFA | Medium | High | PR-2 |
| PR-10 | Agent onboarding | Large | High | PR-3 |
| PR-11 | Bus owner onboarding | Large | High | PR-3 |
| PR-12 | KYC review | Medium | Medium | PR-10, PR-11 |
| PR-13 | Fleets + amenities | Medium | Medium | PR-11 |
| PR-14 | Stops + routes | Large | Medium | PR-13 |
| PR-15 | Trips + schedules + cron | Large | High | PR-14 |
| PR-16 | Seat holds | Medium | High | PR-15 |
| PR-17 | Bookings | Large | Critical | PR-16 |
| PR-18 | Payments + ticket confirm | Large | Critical | PR-17 |
| PR-19 | Cancellations + refunds | Medium | High | PR-18 |
| PR-20 | Wallet + ledger | Large | High | PR-19 |
| PR-21 | Coupons + referrals | Medium | Medium | PR-20 |
| PR-22 | Settlements | Small | Medium | PR-20 |
| PR-23 | Notifications + audit | Large | Medium | All |
| PR-24 | Admin sub-router split | Medium | Medium | All |
