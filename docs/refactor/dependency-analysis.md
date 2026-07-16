# Dependency and Coupling Analysis
**Branch:** `refactor/foundation`  
**Commit:** `df5a7f2`  
**Generated:** 2026-07-16

---

## 1. Controllers Directly Querying Models

Controllers that bypass any service layer and query Mongoose models directly:

| Controller | Models queried directly | Problem |
|---|---|---|
| `controllers/ticketController/ticketController.js` | `bookTicketModel`, `seatsModel`, `seatHoldModel`, `tripModel`, `fleetModel`, `userModel`, `walletModel`, `yatraPointsHistoryModel` | All booking logic in one controller; no service extraction |
| `controllers/ticketController/paymentBookingController.js` | `seatHoldModel`, `bookTicketModel`, `tripModel`, `transactionModel`, `walletModel`, `couponUsageModel` | Payment + booking + wallet credit interleaved |
| `controllers/authControllers.js/authController.js` | `userModel`, `otpModel`, `refreshTokenModel` | Auth logic with direct model access; no auth service |
| `controllers/adminController/adminController.js` | `userModel`, `busOwnerModel`, `agentModel`, `adminModel` | Admin cross-domain reads in one controller |
| `controllers/adminController/walletController/adminWalletController.js` | `walletModel`, `walletTransactionModel`, `userModel` | Direct model access; no wallet service for admin operations |
| `controllers/adminController/financialController/financialController.js` | `smLedgerModel`, `settlementModel`, `transactionModel`, `busOwnerModel` | Cross-domain financial reads without service layer |
| `controllers/busOwnerController/busOwnerController.js` | `fleetModel`, `boardingPointsModel`, `busAmenitiesModel`, `busOwnerModel` | Three unrelated domain models in one controller |

---

## 2. Services Importing Models Owned by Unrelated Domains

| Service | Foreign model imports | Problem |
|---|---|---|
| `services/smLedgerService.js` | `walletModel`, `walletTransactionModel`, `settlementModel`, `bookTicketModel`, `userModel` | Ledger service owns wallet write logic |
| `services/referralV2Service.js` | `userModel`, `walletModel`, `walletTransactionModel`, `referralV2Model`, `bookTicketModel` | Referral service directly manipulates wallet |
| `services/scheduleService.js` | `tripModel`, `scheduleModel`, `busRouteModel`, `fleetModel`, `seatsModel` | Schedule service reaches into fleet and seat models |
| `services/tripService.js` | `tripModel`, `scheduleModel`, `seatsModel`, `bookTicketModel` | Trip service touches booking model |
| `services/walletService.js` | `walletModel`, `walletTransactionModel`, `smLedgerModel` | Wallet service writes to ledger directly (bidirectional) |
| `services/platformRegistryService.js` | `stopModel`, `stopPointModel`, `boardingPointsModel`, `routeStopModel`, `routeCorridorModel` | Registry service spans 5 models across stop/corridor domains |
| `services/fleetService.js` | `fleetModel`, `seatTemplateModel`, `busAmenitiesModel`, `busOwnerModel` | Fleet service imports KYC-level model (busOwnerModel) |

---

## 3. Cross-Domain Model Imports (Summary)

```
auth domain ←→ user domain
  authController reads userModel, otpModel, refreshTokenModel
  agentAuthController reads userModel, agentModel
  busOwnerAuthController reads userModel, busOwnerModel

booking domain → seat domain → fleet domain
  ticketController reads: seatsModel → fleetModel (to validate seat capacity)

payment domain → wallet domain
  paymentBookingController credits walletModel directly on refund/cashback

referral domain → wallet domain
  referralV2Service writes walletTransactionModel (cross-domain write)

settlement domain → ledger domain → wallet domain
  settlementController → smLedgerService → walletModel
```

---

## 4. Circular Dependencies (Actual / Likely)

| Pair | Nature | Risk |
|---|---|---|
| `walletService` ↔ `smLedgerService` | `walletService` writes to ledger; `smLedgerService` reads from wallet | **High** — potential import cycle in Node.js CommonJS |
| `ticketController` → `referralV2Service` → `walletService` → `smLedgerService` | Chain: a booking triggers referral reward which credits wallet which writes ledger | Not a file-level cycle but a deep call chain — hard to test any one piece in isolation |
| `scheduleService` → `tripGeneratorCron` → `scheduleService` | Cron imports service; service may re-schedule — **Needs confirmation** | Medium |

---

## 5. Duplicate Business Logic

### 5a. Duplicate Authentication / OTP Logic

Three nearly identical 3-step OTP flows implemented independently:

| Flow | Controller | Lines |
|---|---|---|
| User registration + password reset | `authController.js` | 1,428 |
| Agent registration + password reset | `agentAuthController.js` | 986 |
| Bus owner registration + password reset | `busOwnerAuthController.js` | 914 |

Each repeats: phone normalization, OTP generation, OTP verification, token issuance, password hashing, refresh token creation, and logout. Total duplicated code estimate: ~600 lines across three files for the same patterns.

**`utils/otpHelper.js` (297 lines) and `utils/tokenService.js` (233 lines) exist** but are not used consistently — some controllers re-implement token logic inline.

### 5b. Duplicate Response Formatting

No shared response wrapper. Each controller builds `{ success: true/false, message: "..." }` manually. Inconsistencies observed:

```js
// Observed pattern variants:
res.json({ success: true, message: "..." })
res.json({ status: true, message: "..." })    // admin middleware error handler uses "status"
res.json({ success: false, error: "..." })
res.status(400).json({ message: "..." })       // no success field
```

### 5c. Duplicate Rate-Limiter Configuration

Login rate limiters are defined three times — once per auth route file — with identical configuration:

```
routes/userRoutes/userRoutes.js         → loginLimiter (10/15min, phone-keyed)
routes/authRoutes/agentAuthRoutes.js    → loginRateLimiter (10/15min, phone-keyed)
routes/authRoutes/busOwnerAuthRoutes.js → loginRateLimiter (10/15min, phone-keyed)
```

All three should reference a single shared factory from `middleware/otpRateLimiter.js`.

### 5d. Duplicate Role-Checking Patterns

```
adminMiddleware.js    — JWT role check then DB admin fetch
verifyRoleFromDB.js   — JWT role then DB user fetch (user domain)
checkRole.js          — Stateless JWT-only role check (no DB)
```

Three different guard mechanisms used inconsistently. Admin routes never use `verifyRoleFromDB`; non-admin routes use `auth + verifyRoleFromDB + checkRole` in varying combinations.

---

## 6. Repeated try/catch Blocks

Every controller function wraps its body in a `try/catch` that returns `500 Internal Server Error`. There is no shared async error handler or wrapper utility. Estimated count: **150+ identical try/catch blocks** across the codebase.

A shared `asyncHandler(fn)` wrapper would eliminate all of them.

---

## 7. Direct SMS, Email, or Push Calls from Business Controllers

| Controller | Direct notification call | Problem |
|---|---|---|
| `paymentBookingController.js` | Firebase `sendMulticast` + nodemailer directly | Payment controller owns notification delivery |
| `ticketController.js` | Email send after cancellation | Booking controller owns email logic |
| `agentAuthController.js` | Email via emailManager on registration | Auth controller owns email |
| `busOwnerAuthController.js` | Email on registration/status | Auth controller owns email |
| `adminBusOwnerController.js` | Email status notification | Admin controller owns email |
| `adminAgentController.js` | Email status notification | Admin controller owns email |

None of these should be in business controllers. A `notifications` module with a simple `notify(userId, event, data)` interface would decouple all of them.

---

## 8. Direct Payment-Provider Logic Inside Business Controllers

`paymentBookingController.js` (1,154 lines) contains:

- eSewa payload construction (inline HMAC-SHA256 hash computation)
- eSewa signature verification
- Payment status polling
- Seat hold creation and expiry
- Booking document creation
- Wallet cashback credit
- Referral reward trigger
- Email + push notification dispatch

This is **7 responsibilities in one file**. The eSewa integration specifically exists in both `paymentBookingController.js` and `services/esewaService.js` (67 lines) / `services/esewaVerificationService.js` (139 lines) — but the controller does not fully delegate to the service, duplicating hash logic.

---

## 9. Files With Too Many Responsibilities

| File | Responsibility count | Detail |
|---|---|---|
| `ticketController.js` | 6+ | Search, seat management, booking, cancellation, YatraPoints, email |
| `paymentBookingController.js` | 7 | Seat hold, eSewa payload, payment verify, booking, wallet, referral, notification |
| `authController.js` | 5 | Registration, login, password reset, profile update, referral code |
| `busOwnerController.js` | 4 | KYC submission, fleet CRUD, boarding points CRUD, amenities CRUD |
| `smLedgerService.js` | 4 | Ledger entries for bookings, refunds, settlements, wallet events |
| `adminController.js` | 5 | User management, commission, announcements, bulk operations, metrics |
| `agentController.js` | 4 | Application workflow, document upload, S3 streaming, dashboard metrics |
| `tripGeneratorCron.js` | 3 | Cron scheduling, trip generation logic, seat initialization |

---

## 10. Functions Longer Than ~50 Lines

Estimated per file (based on total lines and structure):

| File | Estimated longest function | Notes |
|---|---|---|
| `ticketController.js` | ~200–300 lines (`bookTicket`) | Booking + seat update + wallet + notification inline |
| `paymentBookingController.js` | ~150–200 lines (`confirmBooking`) | Payment verify + booking + wallet + referral inline |
| `authController.js` | ~100 lines (`completeRegistration`) | User creation + referral + token issuance |
| `scheduleService.js` | ~100 lines (burst generation) | Nested loop + date math + DB writes |
| `smLedgerService.js` | ~80–100 lines (multi-event ledger writes) | Many conditional branches |
| `tripGeneratorCron.js` | ~150 lines (cron callback) | Trip date iteration + DB upsert logic |

---

## 11. Deeply Nested Conditions

Observed in:
- `ticketController.js` — nested `if` for seat availability → availability check → coupon validation → YatraPoints → payment method branching
- `paymentBookingController.js` — nested payment status checks + error handling branches
- `scheduleService.js` — date range computation with multiple early-return guards

---

## 12. Modules Difficult for Multiple Developers to Edit Simultaneously

| File | Reason |
|---|---|
| `ticketController.js` (2,109 lines) | All passenger-facing booking features in one file — every booking-related PR touches it |
| `routes/adminRoutes/adminRoutes.js` (466 lines) | All admin endpoints in one route file — merge conflicts on every admin feature |
| `authController.js` (1,428 lines) | All user auth in one file — OTP, login, profile, reset all compete |
| `smLedgerService.js` (789 lines) | Every financial operation goes through it — payments, refunds, settlements, wallet |
| `services/scheduleService.js` (898 lines) | Schedule + trip generation + burst logic — ops and data teams both need this |

---

## 13. Summary: Top 5 Coupling Problems to Resolve First

1. **`ticketController.js` god object** — Extract `searchService`, `seatHoldService`, `cancellationService` before any other work.
2. **Triplicated auth flow** — Move shared OTP, token, and password logic into a `shared/auth` module used by all three portals.
3. **Payment controller owns too much** — `paymentBookingController` must delegate to `esewaService` + `walletService` + `notificationService`.
4. **No notification abstraction** — Email, SMS, and push are called inline from 6+ different controllers.
5. **`adminRoutes.js` monolith** — 466 lines, every admin feature in one file — split into per-domain sub-routers.
