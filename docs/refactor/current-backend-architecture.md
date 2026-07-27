# Current Backend Architecture
**Branch:** `refactor/foundation`  
**Commit:** `df5a7f2`  
**Generated:** 2026-07-16  
**Status:** Describes the repository as it exists today — not the target state.

> Items marked **"Needs confirmation"** were inferred from file names and partial reads; they should be verified before a PR that moves them.

---

## 1. Entry Point and Middleware Flow

**File:** `index.js` (273 lines)

```
Process startup
  → dotenv.config()
  → Pre-register adminModel (avoids MissingSchemaError)
  → Create Express app

Middleware pipeline (in order):
  1. CORS          — function-based origin whitelist; reads FRONTEND_URL env
  2. Helmet        — HTTP security headers (+ crossOriginResourcePolicy: cross-origin)
  3. MongoSanitize — custom wrapper; sanitizes body, params, query clone individually
  4. Rate limiter  — 200 req / 15 min on /api/* (express-rate-limit)
                     30 req / 1 min on /api/public/searchTrips (tighter bot protection)
  5. Body parsers  — express.json + express.urlencoded (50 MB limit), cookieParser, express-fileupload (20 MB)
  6. requestLogger — Winston-based structured HTTP logging

GET  /health    → JSON health check (DB connection state, uptime)
GET  /          → HTML status page (rendered inline in index.js)
GET  /testing   → Legacy plain-text endpoint (backward compat)

app.use(indexRoute)  → all /api/* routes dispatched here

Cron jobs started:
  setupTripGeneratorCron()        → services/tripGeneratorCron.js
  setupFleetDocumentExpiryCron()  → services/fleetDocumentExpiryCron.js
  setupReconciliationCron()       → services/reconcilePayments.js

Global error handler — catches unhandled errors, logs via Winston, returns 500 JSON
```

**DB connection:** `db/db.js` — loaded lazily by `utils/server.js` at startup.

---

## 2. Route Mounting Structure

**File:** `routes/indexRoute.js` (45 lines)

All routes are mounted under a single Express router which is registered via `app.use(indexRoute)`.

| Mount Path | Route File | Audience |
|---|---|---|
| `/api` | `routes/userRoutes/userRoutes.js` | Passenger (user auth, profile, coupons, wallet) |
| `/api/ticket` | `routes/ticketRoutes/ticketRoutes.js` | Passenger & Bus Owner (booking, payment, seat ops) |
| `/api/busowner` | `routes/busOwner/busOwner.js` | Bus Owner (fleet, routes, trips, settlements) |
| `/api/admin` | `routes/adminRoutes/adminRoutes.js` | Admin / Super Admin (all admin ops) |
| `/api/referral` | `routes/referralRoutes/referralRoutes.js` | Passenger (referrals) |
| `/api/reviews` | `routes/reviewRoutes/reviewRoutes.js` | Passenger (reviews) |
| `/seed` | `routes/seed/seedRoute.js` | Dev/internal (data seeding) |
| `/api/pushnoti` | `routes/pushNotification/pushNotification.js` | Passenger (push notification registration) |
| `/api/googlemap` | `routes/googleMapRoute/googleMapRoute.js` | Internal / Bus Owner (map route helper) |
| `/api/agent` | `routes/agentRoute/agentRoute.js` | Agent (KYC, profile, dashboard) |
| `/api/public` | `routes/publicRoutes/publicRoute.js` | Public, no auth (stop search, trip search, fare compute) |
| `/api/payment` | `routes/paymentRoutes/paymentRoutes.js` | Passenger (eSewa payment gateway redirect) |
| `/api/conductor` | `routes/conductorRoutes/conductorRoutes.js` | Conductor / Bus Owner (boarding, manifest) |
| `/api` | `routes/partnerLeadRoutes.js` | Public (partner lead capture) |
| `/api/auth/busowner` | `routes/authRoutes/busOwnerAuthRoutes.js` | Bus Owner self-registration & auth |
| `/api/auth/agent` | `routes/authRoutes/agentAuthRoutes.js` | Agent self-registration & auth |
| `/api/auth/activate` | `routes/authRoutes/activateAuthRoutes.js` | Account activation (invite flow) |

---

## 3. Authentication Flow

### 3a. Shared Middleware Chain

```
authMiddleware.js
  → Reads Bearer token from Authorization header OR access_token cookie
  → Verifies JWT signature against SECRET_KEY
  → Enforces purpose === "access" (rejects refresh tokens, temp tokens)
  → Attaches req.userInfo = decoded JWT payload

verifyRoleFromDB.js  (run after authMiddleware on sensitive routes)
  → Loads User from DB by req.userInfo.id
  → Checks: deletedAt, status (banned / inactive / invited)
  → Checks: role drift — activeRole must exist in user.roles array
  → Checks: tokenVersion — must match DB counter (catches post-logout / post-password-change tokens)
  → Checks: forcePasswordChange flag
  → Attaches req.dbUser = fresh DB user

adminMiddleware.js  (admin routes only — does NOT use verifyRoleFromDB)
  → Independent JWT verify against SECRET_KEY
  → Enforces purpose === "access"
  → Role check: SUPER_ADMIN | ADMIN | SUB_ADMIN in JWT
  → DB fetch of SuperAdmin model by decoded.id
  → Checks: isActive, accountLocked
  → Checks: role drift between JWT and DB admin.role
  → Attaches enriched req.adminInfo
```

### 3b. Role-specific middleware

| Middleware | File | Purpose |
|---|---|---|
| `agentMiddleware` | `middleware/checkRole.js` | Checks req.userInfo.role === "agent" |
| `busOwnerMiddleware` | `middleware/checkRole.js` | Checks req.userInfo.role === "busOwner" |
| `requireRole(...)` | `middleware/checkRole.js` | Variadic — checks JWT role against array |
| `requireApprovedAgent` | `middleware/requireApprovedAgent.js` | DB check: Agent.verificationStatus === "approved" |
| `requireApprovedBusOwner` | `middleware/requireApprovedBusOwner.js` | DB check: BusOwner.verificationStatus === "approved" |

---

## 4. Passenger Registration and Login

**Route file:** `routes/userRoutes/userRoutes.js`  
**Controller:** `controllers/authControllers.js/authController.js` (1,428 lines)

3-step registration:
```
POST /api/sendPhoneOTP          → authController.sendPhoneOTP
  [otpRateLimiter]
  → phoneGuard checks: phone not already used by another entity
  → generates OTP, stores in OTP model with purpose="REGISTRATION"

POST /api/verifyPhoneOTP        → authController.verifyPhoneOTP
  [otpVerifyLimiter]
  → validates OTP purpose + expiry, marks used
  → issues a short-lived verificationToken (purpose="PHONE_VERIFIED")

POST /api/completeRegistration  → authController.completeRegistration
  → validates verificationToken
  → creates User document (role: "user")
  → auto-generates referral code (via autoGenerateReferralCode middleware or internal call)
  → returns access + refresh tokens in HttpOnly cookies
```

Login:
```
POST /api/login                 → authController.login
  [loginLimiter — 10 per 15 min, keyed on phone]
  → loads User by phone
  → verifies bcrypt password
  → checks account status
  → issues access token (JWT, 15 min) + refresh token (JWT, 7d, stored in DB)
  → sets HttpOnly cookies
```

Password reset (3-step):
```
POST /api/requestPasswordReset  → [otpRateLimiter] → authController.requestPasswordReset
POST /api/verifyOtpForReset     → [otpVerifyLimiter] → authController.verifyOtpForReset
POST /api/resetPassword         → [otpVerifyLimiter] → authController.resetPassword
```

Token management:
```
POST /api/refresh               → authController.refreshAccessToken
POST /api/logout                → authController.logout (increments tokenVersion, deletes RefreshToken doc)
POST /api/changeForcePassword   → authController.changeForcePassword
```

---

## 5. Agent Registration and KYC

**Auth route file:** `routes/authRoutes/agentAuthRoutes.js`  
**Auth controller:** `controllers/authControllers.js/agentAuthController.js` (986 lines)

Self-registration (mirrors user flow):
```
POST /api/auth/agent/sendOTP      → agentAuth.sendOTP   [otpRateLimiter]
POST /api/auth/agent/verifyOTP    → agentAuth.verifyOTP [otpVerifyLimiter]
POST /api/auth/agent/register     → agentAuth.register  (creates User with role:"agent" + Agent profile)
POST /api/auth/agent/resendOTP    → agentAuth.resendOTP [otpRateLimiter]
POST /api/auth/agent/login        → agentAuth.login     [loginRateLimiter]
POST /api/auth/agent/refresh      → agentAuth.refresh
POST /api/auth/agent/logout       → agentAuth.logout
POST /api/auth/agent/requestPasswordReset
POST /api/auth/agent/verifyOtpForReset
POST /api/auth/agent/resetPassword
```

KYC / Application workflow:
```
POST /api/agent/application/save      [auth, verifyRoleFromDB, agentMiddleware]
POST /api/agent/application/document  [auth, verifyRoleFromDB, agentMiddleware]
POST /api/agent/application/submit    [auth, verifyRoleFromDB, agentMiddleware]
GET  /api/agent/application/status    [auth, verifyRoleFromDB, agentMiddleware]
GET  /api/agent/documents/view        [auth, verifyRoleFromDB, agentMiddleware]

  Controller: controllers/agentController/agentController.js (609 lines)
  → Uploads documents to S3 via services/fileProcessor.js
  → Updates Agent model (status: DRAFT → SUBMITTED)
```

Agent profile and dashboard (APPROVED only):
```
GET /api/agent/profile    [+ requireApprovedAgent]
GET /api/agent/dashboard  [+ requireApprovedAgent]
```

Admin KYC review:
```
controllers/adminController/adminAgentController/adminAgentController.js (692 lines)
  → approve / reject / request-more-info on agent applications
  → sends email notifications via emailManager
```

---

## 6. Bus-Owner Registration and KYC

**Auth route:** `routes/authRoutes/busOwnerAuthRoutes.js`  
**Auth controller:** `controllers/authControllers.js/busOwnerAuthController.js` (914 lines)

Self-registration (same 3-step pattern as agent):
```
POST /api/auth/busowner/sendOTP
POST /api/auth/busowner/verifyOTP
POST /api/auth/busowner/register     → creates User (role:"busOwner") + BusOwner profile
POST /api/auth/busowner/login
POST /api/auth/busowner/refresh
POST /api/auth/busowner/logout
POST /api/auth/busowner/requestPasswordReset
POST /api/auth/busowner/verifyOtpForReset
POST /api/auth/busowner/resetPassword
```

KYC submission:
```
POST /api/busowner/submitBusOwnerKyc      → busOwnerCon.submitBusOwnerKyc
GET  /api/busowner/myBusOwnerKycStatus    → busOwnerCon.getBusOwnerKycStatus
  Controller: controllers/busOwnerController/busOwnerController.js (673 lines)
  → Uploads docs to S3
  → Sets BusOwner.verificationStatus = "pending"
```

Operational routes (behind `requireApprovedBusOwner`):
```
Fleet, routes, trips, settlements, fare rules, staff assignment
  → see Section 11 and 12
```

Admin KYC review:
```
controllers/adminController/busOwnerController/adminBusOwnerController.js (860 lines)
  → list, view, approve, reject, suspend bus owners
  → status transitions fire email notifications
```

---

## 7. Admin Authentication and MFA

> **Important distinction:** The admin authentication system uses a **dedicated `SuperAdmin` Mongoose model** — entirely separate from the passenger `User` model. A `User` document with `role: "admin"` does **not** grant admin portal access; it is handled by `authMiddleware` + `verifyRoleFromDB` only. The `adminMiddleware` exclusively reads the `SuperAdmin` collection and is not involved in passenger auth at all.

**Route file:** `routes/adminRoutes/adminRoutes.js` (466 lines — all admin routes in one file)  
**Controller:** `controllers/adminController/authController/auth-controller.js` (255 lines)

```
POST /api/admin/auth/login
  → load SuperAdmin by email (SuperAdmin model, NOT User model)
  → verify bcrypt password
  → if 2FA enabled: return { mfaRequired: true, tempToken }
  → if no 2FA: issue full access JWT (30 min) + refresh token

POST /api/admin/auth/verify-2fa
  → validate tempToken (purpose="MFA_PENDING")
  → verify TOTP code via speakeasy
  → issue full access JWT (30 min) + refresh token

POST /api/admin/auth/setup-2fa       (first-time only)
POST /api/admin/auth/refresh
POST /api/admin/auth/logout
POST /api/admin/auth/change-password
```

All other admin routes use `adminMiddleware` (not `auth` + `verifyRoleFromDB`).


---

## 8. Fleet Lifecycle

**Route file:** `routes/busOwner/busOwner.js` + `routes/adminRoutes/adminRoutes.js`  
**Controllers:**
- `controllers/busOwnerController/busOwnerController.js` (673 lines) — owner-facing
- `controllers/adminController/busOwnerController/adminBusOwnerFleetController.js` (447 lines)
- `controllers/adminController/busOwnerController/fleetController.js` (246 lines)
- `controllers/adminController/fleetWorkstationController.js` (763 lines)  
**Service:** `services/fleetService.js` (667 lines)  
**Model:** `models/fleetModel.js` (335 lines)

```
Bus Owner submits fleet for verification:
  POST /api/busowner/submitFleetForVerification
    → validates required docs, sets fleet.status = "pending"
    → uploads images to S3

Bus Owner manages own fleets:
  GET    /api/busowner/myFleets
  POST   /api/busowner/getFleetById
  PATCH  /api/busowner/updateFleet
  DELETE /api/busowner/deleteFleet

Admin fleet workstation:
  GET/PATCH on /api/admin/workstation/fleets/*
    → fleetWorkstationController (763 lines) orchestrates:
      approve / reject / suspend / activate
      seat template assignment
      document expiry tracking (cron: fleetDocumentExpiryCron.js)
```

Seat templates:
```
controllers/adminController/busOwnerController/templateController.js (163 lines)
services/seatTemplateService.js (111 lines)
models/seatTemplateModel.js (110 lines)
```

---

## 9. Route and Stop Lifecycle

**Controllers:**
- `controllers/busOwnerController/busOwnerRouteController.js` (135 lines)
- `controllers/adminController/busOwnerController/busRouteController.js` (196 lines)
- `controllers/adminController/platformRegistryController.js` (276 lines)
- `controllers/adminController/routeRequestController.js` (277 lines)
- `src/modules/admin/route-discovery/session.controller.js`
- `src/modules/admin/route-discovery/review.controller.js`
- `src/modules/admin/route-discovery/refinement.controller.js`

**Services:**
- `services/platformRegistryService.js` (624 lines) — canonical stop registry management
- `services/busRouteService.js` (140 lines)
- `services/operatorRouteConfigService.js` (409 lines)
- `src/modules/admin/route-discovery/` — modular AI-assisted route discovery, stop review, matching, refinement, and publishing
- `services/googlePlacesClient.js` (278 lines), `services/mapboxClient.js` (187 lines), `services/minimaxClient.js` (201 lines)

**Models:** `stopModel`, `stopPointModel`, `routeStopModel`, `busRouteModel`, `routeCorridorModel`, `routeVariantModel`, `routeRequestModel`, `routeDiscoveryModel`, `operatorRouteConfigModel`

Stop management (admin):
```
Platform Registry (admin):
  GET    /api/admin/registry/stops
  POST   /api/admin/registry/stops
  PATCH  /api/admin/registry/stops/:id
  DELETE /api/admin/registry/stops/:id
  + similar for boarding-points and corridors

Route Discovery (AI-assisted, admin):
  POST /api/admin/route-discovery/session/create
  (SSE streaming of LLM-refined stop candidates)
```

Bus Owner routes:
```
POST   /api/busowner/createRoute    → busOwnerRouteCon.createRoute
GET    /api/busowner/getMyRoutes
PATCH  /api/busowner/updateRoute
DELETE /api/busowner/deleteRoute
```

---

## 10. Trip Lifecycle

**Controllers:**
- `controllers/busOwnerController/busTripController.js` (162 lines) — owner CRUD
- `controllers/adminController/busOwnerController/tripController.js` (259 lines) — admin view
- `controllers/adminController/scheduleController.js` (360 lines) — schedule management
- `controllers/adminController/tripExceptionController.js` (109 lines)
- `src/modules/admin/trip-overview/` — exception overview, schedule health, global trip search, and route performance

**Services:**
- `services/scheduleService.js` (898 lines) — schedule CRUD + trip burst generation
- `services/tripService.js` (394 lines) — individual trip operations
- `services/tripGeneratorCron.js` (504 lines) — daily cron: generates trips from active schedules
- `services/tripExceptionService.js` (301 lines) — cancel, reschedule, extra-run, date-range cancel

**Model:** `models/tripModel.js` (256 lines), `models/scheduleModel.js` (327 lines)

```
Schedule lifecycle:
  DRAFT → ACTIVE → LIVE → SUSPENDED → INACTIVE
  Schedules generate trips via burst generation on go-live.
  Cron generates trips rolling 30 days ahead.

Trip lifecycle:
  SCHEDULED → DEPARTED → ARRIVED / CANCELLED
  Single-trip exceptions via tripExceptionService.
```

---

## 11. Booking Lifecycle

**Controller:** `controllers/ticketController/ticketController.js` (2,109 lines — largest file)  
**Partial coverage:** `controllers/adminController/ticket-controller/adminTicketController.js` (500 lines)

```
Public trip search:
  POST /api/public/searchTrips      → ticket.searchTrips
  POST /api/public/computeFare      → fareRuleCon.computeEffectiveFare

Seat creation (bus owner):
  POST /api/ticket/createTicket     → ticket.createTicket  [busOwnerGuard]
  POST /api/ticket/creatSeats       → ticket.createSeats   [busOwnerGuard]

Passenger booking (legacy backend-payment flow):
  POST /api/ticket/bookTicket       → ticket.bookTicket

Booking history:
  GET  /api/ticket/getMyTicketHistory
  GET  /api/ticket/getMyYatraHistory
  POST /api/ticket/getSeats

Cancellation:
  POST /api/ticket/cancelTicket
  POST /api/ticket/cancelEstimate   (preview refund amount)

YatraPoints validation:
  POST /api/ticket/validateYatraPoints
```

**Critical note:** `ticketController.js` handles search, seat management, booking, YatraPoints, cancellation, and email/notification side effects all in one 2,109-line file. Multiple responsibilities are deeply interleaved.

---

## 12. Seat-Hold Lifecycle

**Needs confirmation** — `models/seatHoldModel.js` (41 lines) exists.  
Seat holds appear to be managed within `paymentBookingController.js` as part of the `prepareBooking` step.

```
POST /api/ticket/prepareBooking
  → paymentBookingController.prepareBooking
  → Creates a seat hold (reserves seat for payment window ~10 min)
  → Returns eSewa payment payload

POST /api/ticket/confirmBooking
  → paymentBookingController.confirmBooking
  → Verifies eSewa payment signature
  → Converts seat hold → confirmed booking

GET  /api/ticket/verifyBooking/:ticketId
  → paymentBookingController.verifyBooking
```

---

## 13. Payment Lifecycle

**Controller:** `controllers/ticketController/paymentBookingController.js` (1,154 lines)  
**eSewa verification:** `controllers/esewaPaymentVerification/esewaPaymentVerification.js` (78 lines)  
**Services:** `services/esewaService.js` (67 lines), `services/esewaVerificationService.js` (139 lines)

```
Gateway: eSewa (Nepal)
Route: POST /api/payment/verify → esewaPaymentVerification.verify  (gateway callback)

Flow:
  prepareBooking → hold seats + generate eSewa payload
  (user pays on eSewa frontend)
  confirmBooking → verify eSewa signature, confirm booking, send ticket email + push notification
  (fallback) /api/payment/verify → server-side eSewa callback handler

Disputed payments (money received but booking failed):
  GET    /api/admin/disputes
  PATCH  /api/admin/disputes/:transactionId/resolve

Transactions:
  GET /api/admin/transactions
  GET /api/admin/transactions/:id

  controller: transactionController (121 lines)
  model: transactionModel (132 lines)
```

SM Ledger (internal double-entry accounting):
```
services/smLedgerService.js (789 lines)
models/smLedgerModel.js (178 lines)
  → Records every financial event: booking, refund, settlement, wallet credit
```

---

## 14. Cancellation and Refund Lifecycle

**Cancellation:** Inside `ticketController.js` (cancelTicket, cancelEstimate)  
**Admin refund:** `controllers/adminController/refundController/adminRefundController.js` (294 lines)  
**Refund calculator:** `services/refundCalculatorService.js` (148 lines)  
**Policy management:** `controllers/adminController/refundPolicyController/refundPolicycontroller.js` (209 lines)

```
Passenger:
  POST /api/ticket/cancelEstimate   → shows refund breakdown (policy-driven)
  POST /api/ticket/cancelTicket     → submits cancellation

Admin:
  GET    /api/admin/refunds         → refund queue
  PATCH  /api/admin/refunds/:id/approve
  PATCH  /api/admin/refunds/:id/reject
  
  Refund Policy CRUD:
  GET/POST/PATCH /api/admin/refund-policies

Models: refundModel, refundDetailsModel, refundPolicyModel
```

---

## 15. Wallet Lifecycle

**Controller:** `controllers/walletController/walletController.js` (189 lines)  
**Admin wallet:** `controllers/adminController/walletController/adminWalletController.js` (556 lines)  
**Service:** `services/walletService.js` (190 lines)  
**Scratch cards:** `controllers/walletController/scratchCardController.js` (127 lines)

```
Passenger:
  GET  /api/wallet/details
  POST /api/wallet/setup-pin
  POST /api/wallet/verify-pin
  GET  /api/wallet/scratch-cards
  POST /api/wallet/scratch/:cardId

Admin:
  Wallet management, transaction history, balance adjustments

Models: walletModel, walletTransactionModel, scratchCardModel
```

---

## 16. Coupon Lifecycle

**Controllers:**
- `controllers/couponController/userCouponController.js` (431 lines)
- `controllers/couponController/recordCouponUsageController.js` (190 lines)
- `controllers/adminController/coupon-controller/adminCouponController.js` (777 lines)

**Helper:** `handlers/couponHelper.js` (395 lines)

```
Passenger:
  GET  /api/coupons/all
  GET  /api/coupons/available
  POST /api/coupons/validate
  GET  /api/coupons/best
  POST /api/coupons/record-usage

Admin:
  Full CRUD, bulk operations, usage analytics
  Scratch card theme management (/api/admin/scratch-themes)

Models: couponModel, couponUsageModel, userCouponUsageModel, scratchCardModel
```

---

## 17. Settlement Lifecycle

**Controller:** `controllers/busOwnerController/settlementController.js` (216 lines)  
**Admin financial:** `controllers/adminController/financialController/financialController.js` (460 lines)  
**Service:** `services/brandFinancialService.js` (234 lines)  
**SM Ledger:** `services/smLedgerService.js` (789 lines)

```
Bus Owner:
  POST  /api/busowner/raiseSettlement
  GET   /api/busowner/getMySettlements
  PATCH /api/busowner/markSettlementReceived

Admin:
  Settlement list + approve / reject
  Financial overview per brand (operator)

Models: settlementModel, smLedgerModel, agentSettlementModel
```

---

## 18. Notification Lifecycle

**Controller:** `controllers/notificationController/notificationController.js` (213 lines)  
**Manager:** `controllers/notificationController/notification_manager.js` (84 lines)  
**Push route:** `routes/pushNotification/pushNotification.js` (30 lines)

```
Push notifications via Firebase Admin SDK
Local (in-app) notifications stored in localNotificationModel

Email notifications:
  handlers/agentStatusEmailTemp.js
  handlers/busOwnerStatusEmailTemp.js
  handlers/otp-template.js
  handlers/password-email-template.js
  emailManager/emailManager.js (27 lines) — nodemailer transport
  handlers/sparro-otp.js (48 lines) — Sparro SMS OTP gateway (Nepal)

Notifications are triggered directly from business controllers
(booking confirmation, KYC status changes, etc.) — no dedicated
notification service layer. [Coupling concern — see dependency analysis]
```

---

## 19. Known File-Level Responsibility Mixtures

| File | Mixed Responsibilities |
|---|---|
| `ticketController.js` (2,109) | Seat management, public search, booking, cancellation, YatraPoints, email side-effects |
| `authController.js` (1,428) | Registration, login, password reset, profile update, referral code generation |
| `paymentBookingController.js` (1,154) | Seat hold, payment gateway integration, booking confirmation, wallet crediting, push notification |
| `agentAuthController.js` (986) | Registration, login, password reset, token rotation — all in one file |
| `busOwnerAuthController.js` (914) | Same as agent auth |
| `busOwnerController.js` (673) | KYC submission, fleet ops, boarding points, amenities — three unrelated domains |
| `smLedgerService.js` (789) | Ledger entries for bookings, refunds, settlements, wallet — all financial events mixed |
| `adminCouponController.js` (777) | Coupon CRUD, scratch card management, usage analytics |
| `adminController.js` (717) | User management, commission config, announcements, dashboard metrics |
| `tripGeneratorCron.js` (504) | Cron scheduling + trip generation business logic embedded together |
