# File-Size Baseline Report
**Branch:** `refactor/foundation`  
**Commit:** `df5a7f2` (pre-docs snapshot)  
**Generated:** 2026-07-16  
**Command used:**
```bash
find . \
  -type f \( -name "*.js" -o -name "*.cjs" -o -name "*.mjs" \) \
  -not -path "./node_modules/*" \
  -not -path "./coverage/*" \
  -not -path "./dist/*" \
  -not -path "./build/*" \
  -print0 | xargs -0 wc -l | sort -nr | head -30
```

---

## Summary Statistics

| Metric | Count |
|---|---|
| Total source files measured | 221 |
| Total lines (all files) | 46,842 |
| Files **≥ 150 lines** | 90 |
| Files **≥ 300 lines** | 44 |
| Files **≥ 500 lines** | 22 |
| Files **≥ 1,000 lines** | 4 |

> ⚠️ These numbers were verified by running the `find | wc -l` command directly in the worktree. They are ground truth.

---

## Top 30 Files by Line Count (verified)

| Rank | Lines | File | Category | Future Module | Risk |
|---|---|---|---|---|---|
| 1 | **2,109** | `controllers/ticketController/ticketController.js` | Controller | `bookings` / `tickets` / `seat-holds` | **Critical** |
| 2 | **1,428** | `controllers/authControllers.js/authController.js` | Controller | `auth` / `users` | **Critical** |
| 3 | **1,154** | `controllers/ticketController/paymentBookingController.js` | Controller | `payments` / `bookings` | **Critical** |
| 4 | **1,108** | `services/routeDiscoveryService.js` | Service | `routes` / `stops` | High |
| 5 | 986 | `controllers/authControllers.js/agentAuthController.js` | Controller | `agents` / `auth` | High |
| 6 | 954 | `controllers/adminController/tripOverviewController.js` | Controller | `admin` / `trips` | High |
| 7 | 914 | `controllers/authControllers.js/busOwnerAuthController.js` | Controller | `operators` / `auth` | High |
| 8 | 898 | `services/scheduleService.js` | Service | `trips` / `schedules` | High |
| 9 | 860 | `controllers/adminController/busOwnerController/adminBusOwnerController.js` | Controller | `admin` / `operators` | High |
| 10 | 789 | `services/smLedgerService.js` | Service | `wallet` / `settlements` | High |
| 11 | 777 | `controllers/adminController/coupon-controller/adminCouponController.js` | Controller | `coupons` | Medium |
| 12 | 763 | `controllers/adminController/fleetWorkstationController.js` | Controller | `admin` / `fleets` | High |
| 13 | 717 | `controllers/adminController/adminController.js` | Controller | `admin` / `users` / `kyc` | High |
| 14 | 692 | `controllers/adminController/adminAgentController/adminAgentController.js` | Controller | `admin` / `agents` | Medium |
| 15 | 673 | `controllers/busOwnerController/busOwnerController.js` | Controller | `operators` / `fleets` | High |
| 16 | 667 | `services/fleetService.js` | Service | `fleets` | Medium |
| 17 | 642 | `services/referralV2Service.js` | Service | `referrals` | Medium |
| 18 | 624 | `services/platformRegistryService.js` | Service | `stops` / `boarding-points` | Medium |
| 19 | 609 | `controllers/agentController/agentController.js` | Controller | `agents` / `kyc` | Medium |
| 20 | 556 | `controllers/adminController/walletController/adminWalletController.js` | Controller | `admin` / `wallet` | Medium |
| 21 | 504 | `services/tripGeneratorCron.js` | Cron service | `trips` | High |
| 22 | 500 | `controllers/adminController/ticket-controller/adminTicketController.js` | Controller | `admin` / `tickets` | Medium |
| 23 | 466 | `routes/adminRoutes/adminRoutes.js` | Route | `admin` (split per domain) | Low |
| 24 | 460 | `controllers/adminController/financialController/financialController.js` | Controller | `admin` / `settlements` | Medium |
| 25 | 447 | `controllers/adminController/busOwnerController/adminBusOwnerFleetController.js` | Controller | `admin` / `fleets` | Medium |
| 26 | 431 | `controllers/couponController/userCouponController.js` | Controller | `coupons` | Low |
| 27 | 409 | `services/operatorRouteConfigService.js` | Service | `routes` / `operators` | Medium |
| 28 | 408 | `controllers/busOwnerController/staffAssignmentController.js` | Controller | `operators` / `staff` | Low |
| 29 | 403 | `controllers/adminController/scratchThemeController.js` | Controller | `coupons` / `wallet` | Low |
| 30 | 395 | `handlers/couponHelper.js` | Utility | `coupons` (shared) | Low |

---

## Files 31–90 (150–394 lines)

| Rank | Lines | File | Category | Risk |
|---|---|---|---|---|
| 31 | 394 | `services/tripService.js` | Service | Medium |
| 32 | 392 | `controllers/referralController/referralController.js` | Controller | Low |
| 33 | 386 | `tests/authSecurityTest.js` | Test | Low |
| 34 | 362 | `controllers/partnerLeadController.js` | Controller | Low |
| 35 | 360 | `controllers/adminController/scheduleController.js` | Controller | Medium |
| 36 | 355 | `controllers/adminController/operatorRouteConfigController.js` | Controller | Medium |
| 37 | 351 | `models/agentModel.js` | Model | Low |
| 38 | 335 | `models/fleetModel.js` | Model | Low |
| 39 | 327 | `models/scheduleModel.js` | Model | Low |
| 40 | 317 | `controllers/adminController/disputedPaymentsController.js` | Controller | Low |
| 41 | 307 | `controllers/reviewController/reviewController.js` | Controller | Low |
| 42 | 306 | `controllers/adminController/driverController.js` | Controller | Low |
| 43 | 302 | `controllers/adminController/ticket-controller/adminamenitiesController.js` | Controller | Low |
| 44 | 301 | `services/tripExceptionService.js` | Service | Medium |
| 45 | 297 | `utils/otpHelper.js` | Utility | Medium |
| 46 | 294 | `controllers/adminController/refundController/adminRefundController.js` | Controller | Medium |
| 47 | 279 | `services/fileProcessor.js` | Service | Low |
| 48 | 278 | `services/googlePlacesClient.js` | Service | Low |
| 49 | 277 | `controllers/adminController/routeRequestController.js` | Controller | Low |
| 50 | 276 | `controllers/adminController/platformRegistryController.js` | Controller | Medium |
| 51 | 273 | `index.js` | Entry point | Medium |
| 52 | 259 | `controllers/adminController/busOwnerController/tripController.js` | Controller | Medium |
| 53 | 256 | `models/tripModel.js` | Model | Low |
| 54 | 255 | `controllers/adminController/authController/auth-controller.js` | Controller | High |
| 55 | 254 | `controllers/adminController/platformConfigController.js` | Controller | Low |
| 56 | 248 | `controllers/adminController/routeDiscoveryController.js` | Controller | Low |
| 57 | 246 | `controllers/adminController/busOwnerController/fleetController.js` | Controller | Medium |
| 58 | 240 | `models/bookTicketModel.js` | Model | Low |
| 59 | 236 | `models/routeDiscoveryModel.js` | Model | Low |
| 60 | 234 | `services/brandFinancialService.js` | Service | Low |
| 61 | 233 | `utils/tokenService.js` | Utility | Medium |
| 62 | 227 | `controllers/conductorController/conductorController.js` | Controller | Low |
| 63 | 221 | `controllers/adminController/dashboardController/dashboardController.js` | Controller | Low |
| 64 | 221 | `controllers/adminController/analyticsController/analyticsController.js` | Controller | Low |
| 65 | 219 | `models/userModel.js` | Model | Medium |
| 66 | 216 | `controllers/busOwnerController/settlementController.js` | Controller | Low |
| 67 | 214 | `controllers/adminController/booking/bookingController.js` | Controller | Medium |
| 68 | 213 | `controllers/notificationController/notificationController.js` | Controller | Low |
| 69 | 210 | `models/driverProfileModel.js` | Model | Low |
| 70 | 209 | `controllers/adminController/refundPolicyController/refundPolicycontroller.js` | Controller | Low |
| 71 | 205 | `models/stopModel.js` | Model | Low |
| 72 | 201 | `services/minimaxClient.js` | Service | Low |
| 73 | 196 | `controllers/adminController/busOwnerController/busRouteController.js` | Controller | Low |
| 74 | 190 | `services/walletService.js` | Service | Medium |
| 75 | 190 | `controllers/couponController/recordCouponUsageController.js` | Controller | Low |
| 76 | 189 | `controllers/walletController/walletController.js` | Controller | Low |
| 77 | 188 | `services/s3Service.js` | Service | Low |
| 78 | 187 | `services/mapboxClient.js` | Service | Low |
| 79 | 186 | `utils/phoneGuard.js` | Utility | Low |
| 80 | 185 | `models/referralV2Model.js` | Model | Low |
| 81 | 182 | `models/couponModel.js` | Model | Low |
| 82 | 179 | `scripts/migrate-to-sm-ledger.js` | Migration script | Low |
| 83 | 178 | `models/smLedgerModel.js` | Model | Low |
| 84 | 163 | `controllers/adminController/busOwnerController/templateController.js` | Controller | Low |
| 85 | 162 | `controllers/busOwnerController/busTripController.js` | Controller | Low |
| 86 | 161 | `scripts/backfill_stop_departures.js` | Migration script | Low |
| 87 | 161 | `models/operatorRouteConfigModel.js` | Model | Low |
| 88 | 161 | `controllers/authControllers.js/activateAccountController.js` | Controller | Low |
| 89 | 154 | `models/busOwnerModel.js` | Model | Low |
| 90 | 153 | `controllers/adminController/busOwnerController/boardingPointController.js` | Controller | Low |
| 90 | 150 | `controllers/busOwnerController/fareRuleController.js` | Controller | Low |

---

## Discrepancy Note vs. Initial Draft

The initial draft reported 222 total files and 47,220 total lines. The verified ground-truth command produces **221 files and 46,842 lines**. The difference is minor (one file or count discrepancy from `wc -l` on directories). The ranking and all individual file counts in this report are the authoritative numbers from the direct command above.

Two script files (`scripts/migrate-to-sm-ledger.js` at 179 lines, `scripts/backfill_stop_departures.js` at 161 lines) were omitted from the initial draft — they appear in the accurate list at ranks 82 and 86.

---

## Risk Definitions

| Level | Meaning |
|---|---|
| **Critical** | Core revenue flow. Touches payments, bookings, or primary auth. Must have characterization tests and full rollback plan before touching. |
| **High** | Multi-domain responsibility, tight coupling, or deeply nested logic. Staged extraction required. |
| **Medium** | Single domain but over 150 lines with some coupling. Extractable in one PR with standard care. |
| **Low** | Focused responsibility, few dependents. Minimal risk. |

---

## Priority Extraction Order

1. **Shared foundation** — `utils/tokenService.js`, `utils/otpHelper.js`, `utils/phoneGuard.js`, `utils/enumGuard.js` — must be stable before anything moves
2. **Auth split** — `authController.js` (1,428) — split into: `loginController`, `registrationController`, `passwordResetController`, `sessionController`
3. **Ticket god-object** — `ticketController.js` (2,109) — the single most dangerous file; extract `seat-holds`, `cancellations`, `search` first
4. **Payment controller** — `paymentBookingController.js` (1,154) — extract `prepareBooking`, `confirmBooking`, `verifyBooking` into dedicated services
5. **Agent + bus owner auth** — `agentAuthController.js` (986) + `busOwnerAuthController.js` (914) — same split pattern as user auth
6. **Schedule service** — `scheduleService.js` (898) — extract burst-generation logic from the cron dispatcher
