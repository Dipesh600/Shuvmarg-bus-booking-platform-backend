# Target Module Map
**Branch:** `refactor/foundation`  
**Commit:** `df5a7f2`  
**Generated:** 2026-07-16

> This is the proposed end-state structure for the repository. **No folders are created during Phase 0.** These are planning boundaries only.  
> The file naming convention for each module will be: `src/modules/<module>/`

---

## Proposed Directory Skeleton

```
src/
  modules/
    shared/           ← foundation utilities used by all modules
    auth/             ← user authentication (passenger)
    users/            ← user profile, preferences
    agents/           ← agent portal (non-auth)
    operators/        ← bus owner portal (non-auth)
    staff/            ← conductors, drivers
    kyc/              ← KYC review workflows (admin-side)
    stops/            ← canonical stop registry
    boarding-points/  ← physical boarding/dropping points
    corridors/        ← route corridors
    routes/           ← bus routes
    fleets/           ← vehicle management
    amenities/        ← bus amenity catalogue
    seat-layouts/     ← seat templates
    trips/            ← trip scheduling, exceptions
    seat-holds/       ← ephemeral seat reservation
    fares/            ← dynamic fare rules
    bookings/         ← booking CRUD, history
    payments/         ← eSewa integration, transaction records
    tickets/          ← ticket generation, QR, conductor view
    cancellations/    ← cancellation workflow
    refunds/          ← refund calculator, queue, policy
    wallet/           ← passenger wallet, scratch cards
    coupons/          ← coupon management (user + admin)
    referrals/        ← referral programme
    settlements/      ← operator settlement lifecycle
    notifications/    ← unified notification dispatch
    admin/            ← admin-specific ops (user management, KYC review, etc.)
    audit/            ← audit log
```

---

## Module Specifications

---

### `shared`

**Owns:**
- Async error handler wrapper (`asyncHandler`)
- Unified response formatter (`respond(res, status, body)`)
- OTP generation and verification (`utils/otpHelper.js` → move here)
- Token issue / verify / rotate (`utils/tokenService.js` → move here)
- Phone normalization and guard (`utils/phoneGuard.js` → move here)
- Anti-enumeration primitives (`utils/enumGuard.js` → move here)
- Password validator (`utils/passwordValidator.js` → move here)
- Verification token (`utils/verificationToken.js` → move here)
- Logger (`utils/logger.js` → move here)
- S3 service (`services/s3Service.js` → move here)
- File processor (`services/fileProcessor.js` → move here)
- Email transport (`emailManager/emailManager.js` + `handlers/*.js` → move here)
- OTP rate limiter (`middleware/otpRateLimiter.js` → move here)
- Request logger middleware (`middleware/requestLogger.js` → move here)
- DB connection (`db/db.js` → move here)

**Collections owned:** None (infrastructure only)

**Existing files:**
```
utils/otpHelper.js
utils/tokenService.js
utils/phoneGuard.js
utils/enumGuard.js
utils/passwordValidator.js
utils/verificationToken.js
utils/logger.js
utils/server.js
services/s3Service.js
services/fileProcessor.js
emailManager/emailManager.js
handlers/sparro-otp.js
handlers/otp-template.js
handlers/password-email-template.js
handlers/agentStatusEmailTemp.js
handlers/busOwnerStatusEmailTemp.js
handlers/passwordGenerator.js
handlers/referralCodeGenerator.js
middleware/otpRateLimiter.js
middleware/requestLogger.js
db/db.js
```

**Public operations:** `sendOTP`, `verifyOTPCode`, `issueTokenPair`, `refreshAccessToken`, `revokeRefreshToken`, `asyncHandler`, `respond`

**Depends on:** Nothing internal

**Depended on by:** Every module

---

### `auth`

**Owns:**
- Passenger user registration (3-step OTP)
- Passenger login
- Passenger password reset
- Force password change
- Token refresh / logout
- Auth middleware (JWT verification)
- Role-from-DB middleware
- Account activation (invite flow)

**Collections owned:** `otps`, `refreshtokens` (primary owner)

**Existing files:**
```
controllers/authControllers.js/authController.js          (1,428 lines — split required)
controllers/authControllers.js/activateAccountController.js (161 lines)
middleware/authMiddleware.js
middleware/verifyRoleFromDB.js
middleware/autoGenerateReferralCode.js
routes/userRoutes/userRoutes.js          (auth portion only)
routes/authRoutes/activateAuthRoutes.js
models/otpModel.js
models/refreshTokenModel.js
```

**Public operations:** `requireAuth`, `requireRoleFromDB`, `issueTokensForUser`

**Depends on:** `shared`

**Depends on by:** `users`, `agents`, `operators`, `admin`, `bookings`, `wallet`, `coupons`, `referrals`

**Business invariants:**
- OTP expires in 5 minutes; single use; purpose-bound
- Refresh tokens stored in DB; rotation on every use; version counter invalidates on logout/password change
- `forcePasswordChange` blocks all endpoints except the change-password route

---

### `users`

**Owns:**
- Passenger profile (name, address, gender, profile pic)
- YatraPoints history view
- User coupon usage history (read)

**Collections owned:** `users` (shared with `auth`, `agents`, `operators` — represents a unified User document)

**Existing files:**
```
controllers/authControllers.js/authController.js   (profile update portion)
models/userModel.js
models/yatraPointsHistoryModel.js
models/userDeviceInfoModel.js
```

**Public operations:** `getUserById`, `updateProfile`, `getYatraPoints`

**Depends on:** `auth`, `shared`

**Depended on by:** `bookings`, `wallet`, `referrals`, `admin`

---

### `agents`

**Owns:**
- Agent self-registration and auth (3-step OTP, login, password reset)
- Agent KYC application workflow (save draft, upload docs, submit)
- Agent profile view
- Agent dashboard metrics

**Collections owned:** `agents`

**Existing files:**
```
controllers/authControllers.js/agentAuthController.js   (986 lines — split required)
controllers/agentController/agentController.js           (609 lines)
middleware/requireApprovedAgent.js
middleware/checkRole.js (agentMiddleware)
routes/authRoutes/agentAuthRoutes.js
routes/agentRoute/agentRoute.js
models/agentModel.js
models/agentBookingModel.js
models/agentWalletTransactionModel.js
models/agentSettlementModel.js
```

**Public operations:** `requireApprovedAgent`, `getAgentByUserId`

**Depends on:** `shared`, `auth`

**Depended on by:** `kyc`, `admin`, `settlements`

---

### `operators`

**Owns:**
- Bus owner self-registration and auth
- Bus owner KYC submission
- Bus owner profile

**Collections owned:** `busowners`, `operatorbrands`

**Existing files:**
```
controllers/authControllers.js/busOwnerAuthController.js   (914 lines — split required)
controllers/busOwnerController/busOwnerController.js        (673 lines — split required)
middleware/requireApprovedBusOwner.js
middleware/checkRole.js (busOwnerMiddleware)
routes/authRoutes/busOwnerAuthRoutes.js
routes/busOwner/busOwner.js  (auth + KYC portion)
models/busOwnerModel.js
models/operatorBrandModel.js
```

**Public operations:** `requireApprovedBusOwner`, `getOperatorByUserId`, `getOperatorByBrandId`

**Depends on:** `shared`, `auth`

**Depended on by:** `fleets`, `routes`, `trips`, `settlements`, `kyc`, `admin`

---

### `staff`

**Owns:**
- Conductor profile management
- Driver profile management
- Staff assignment to trips
- Trip manifest (conductor view)
- Boarding confirmation

**Collections owned:** `conductorprofiles`, `driverprofiles`

**Existing files:**
```
controllers/conductorController/conductorController.js   (227 lines)
controllers/busOwnerController/staffAssignmentController.js  (408 lines)
controllers/adminController/driverController.js           (306 lines)
routes/conductorRoutes/conductorRoutes.js
models/conductorProfileModel.js
models/driverProfileModel.js
```

**Public operations:** `getAssignedDriver`, `getAssignedConductor`

**Depends on:** `shared`, `auth`, `trips`

**Depended on by:** `trips`, `admin`

---

### `kyc`

**Owns:**
- Admin-side KYC review for agents and bus owners
- Document streaming proxy (S3)
- Status transitions: SUBMITTED → APPROVED / REJECTED / MORE_INFO

**Collections owned:** None (reads from `agents`, `busowners`)

**Existing files:**
```
controllers/adminController/adminAgentController/adminAgentController.js   (692 lines)
controllers/adminController/busOwnerController/adminBusOwnerController.js  (860 lines)
controllers/adminController/kycVerificationController/kycVerificationcontroller.js (106 lines)
controllers/adminController/documentProxyController.js  (141 lines)
```

**Public operations:** `approveAgent`, `approveOperator`, `rejectKYC`

**Depends on:** `shared`, `agents`, `operators`, `notifications`

**Depended on by:** `admin`

---

### `stops`

**Owns:**
- Canonical stop registry (create, update, search, popularity tracking)
- Public stop autocomplete API
- AI-assisted stop discovery pipeline (Google Places + Mapbox + Minimax)

**Collections owned:** `stops`, `stoppoints`

**Existing files:**
```
controllers/adminController/platformRegistryController.js   (276 lines) — stop portion
controllers/adminController/routeDiscoveryController.js     (248 lines)
controllers/public/stopSearchController.js                  (138 lines)
services/platformRegistryService.js    (624 lines) — stop portion
services/routeDiscoveryService.js      (1,108 lines)
services/googlePlacesClient.js         (278 lines)
services/mapboxClient.js               (187 lines)
services/minimaxClient.js              (201 lines)
models/stopModel.js
models/stopPointModel.js
models/routeDiscoveryModel.js
```

**Public operations:** `searchStops`, `getStopById`, `recordStopSelection`

**Depends on:** `shared`

**Depended on by:** `boarding-points`, `routes`, `trips`, `bookings`

---

### `boarding-points`

**Owns:**
- Physical boarding and dropping point management (under a Stop)
- Bus Owner boarding point CRUD

**Collections owned:** `boardingpoints`

**Existing files:**
```
controllers/busOwnerController/busOwnerController.js    (boarding portion)
controllers/adminController/busOwnerController/boardingPointController.js  (153 lines)
services/boardingPointService.js   (87 lines)
models/boardingPointsModel.js
```

**Public operations:** `getBoardingPointsByStop`

**Depends on:** `shared`, `stops`, `operators`

**Depended on by:** `routes`, `bookings`, `tickets`

---

### `corridors`

**Owns:**
- Route corridor definitions (geographic segments)

**Collections owned:** `routecorridors`

**Existing files:**
```
controllers/adminController/platformRegistryController.js  (corridor portion)
services/platformRegistryService.js                        (corridor portion)
models/routeCorridorModel.js
```

**Depends on:** `shared`, `stops`

**Depended on by:** `routes`

---

### `routes`

**Owns:**
- Bus route CRUD (bus owner and admin)
- Route stops configuration
- Route variants
- Operator route config (pricing, boarding point assignments)
- Route requests (bus owners requesting new routes)

**Collections owned:** `busroutes`, `routestops`, `routevariants`, `operatorrouteconfigs`, `routerequests`

**Existing files:**
```
controllers/busOwnerController/busOwnerRouteController.js             (135 lines)
controllers/adminController/busOwnerController/busRouteController.js  (196 lines)
controllers/adminController/operatorRouteConfigController.js          (355 lines)
controllers/adminController/routeRequestController.js                 (277 lines)
services/busRouteService.js             (140 lines)
services/operatorRouteConfigService.js  (409 lines)
models/busRouteModel.js
models/routeStopModel.js
models/routeVariantModel.js
models/operatorRouteConfigModel.js
models/routeRequestModel.js
```

**Public operations:** `getRouteById`, `getRouteStops`

**Depends on:** `shared`, `stops`, `boarding-points`, `corridors`, `operators`

**Depended on by:** `trips`, `bookings`, `fares`

---

### `fleets`

**Owns:**
- Fleet (vehicle) lifecycle: submission, verification, activation, suspension
- Fleet document expiry cron
- Seat template assignment to fleet

**Collections owned:** `fleets`

**Existing files:**
```
controllers/busOwnerController/busOwnerController.js          (fleet portion)
controllers/adminController/busOwnerController/adminBusOwnerFleetController.js  (447 lines)
controllers/adminController/busOwnerController/fleetController.js               (246 lines)
controllers/adminController/fleetWorkstationController.js                       (763 lines)
services/fleetService.js                  (667 lines)
services/fleetDocumentExpiryCron.js       (124 lines)
models/fleetModel.js
```

**Public operations:** `getFleetById`, `getActiveFleetsByOperator`

**Depends on:** `shared`, `operators`, `seat-layouts`

**Depended on by:** `trips`, `admin`

---

### `amenities`

**Owns:**
- Bus amenity catalogue (WiFi, AC, Charging, etc.)
- Amenity assignment to fleets

**Collections owned:** `busamenitiess` (Needs confirmation on collection name)

**Existing files:**
```
controllers/busOwnerController/busOwnerController.js        (amenities portion)
controllers/adminController/ticket-controller/adminamenitiesController.js  (302 lines)
controllers/adminController/amenity/amenityController.js    (125 lines)
services/amenityService.js  (65 lines)
models/busAmenitiesModel.js
```

**Depends on:** `shared`, `operators`

**Depended on by:** `fleets`, `trips`, `bookings`

---

### `seat-layouts`

**Owns:**
- Seat template definitions (2x2, sleeper, semi-sleeper etc.)
- Auto seat generation from templates

**Collections owned:** `seattemplates`, `autoseatss` (Needs confirmation)

**Existing files:**
```
controllers/adminController/busOwnerController/templateController.js  (163 lines)
controllers/adminController/seat-controller/adminAutoSeatController.js  (67 lines)
services/seatTemplateService.js  (111 lines)
models/seatTemplateModel.js
models/autoSeatsModel.js
models/seatsModel.js
```

**Depends on:** `shared`

**Depended on by:** `fleets`, `trips`, `bookings`

---

### `trips`

**Owns:**
- Trip scheduling and lifecycle (SCHEDULED → DEPARTED → ARRIVED / CANCELLED)
- Schedule management (DRAFT → ACTIVE → LIVE → SUSPENDED → INACTIVE)
- Schedule versioning
- Trip generation cron (30-day rolling window)
- Single-trip exceptions (cancel, reschedule, extra-run, date-range cancel)
- Trip overview (admin: passenger manifest, seat map)

**Collections owned:** `trips`, `schedules`, `tripexceptions` (Needs confirmation)

**Existing files:**
```
controllers/busOwnerController/busTripController.js          (162 lines)
controllers/adminController/busOwnerController/tripController.js   (259 lines)
controllers/adminController/scheduleController.js            (360 lines)
controllers/adminController/tripExceptionController.js       (109 lines)
controllers/adminController/tripOverviewController.js        (954 lines)
services/scheduleService.js      (898 lines)
services/tripService.js          (394 lines)
services/tripGeneratorCron.js    (504 lines)
services/tripExceptionService.js (301 lines)
models/tripModel.js
models/scheduleModel.js
models/busScheduleModel.js
```

**Public operations:** `getTripById`, `searchTrips`, `getTripManifest`

**Depends on:** `shared`, `routes`, `fleets`, `seat-layouts`

**Depended on by:** `seat-holds`, `bookings`, `payments`, `cancellations`, `staff`

---

### `seat-holds`

**Owns:**
- Ephemeral seat reservation during payment window (~10 min TTL)
- Seat hold creation, expiry, conversion to booking

**Collections owned:** `seatHolds`

**Existing files:**
```
controllers/ticketController/paymentBookingController.js  (seat-hold portion)
models/seatHoldModel.js
```

**Public operations:** `createSeatHold`, `confirmSeatHold`, `expireSeatHolds`

**Depends on:** `shared`, `trips`

**Depended on by:** `bookings`, `payments`

---

### `fares`

**Owns:**
- Dynamic fare rule management (advance booking discount, surge, per-seat pricing)
- Effective fare computation (public API)

**Collections owned:** `farerules`

**Existing files:**
```
controllers/busOwnerController/fareRuleController.js  (150 lines)
models/fareRuleModel.js
```

**Public operations:** `computeEffectiveFare`

**Depends on:** `shared`, `trips`, `routes`

**Depended on by:** `bookings`, `payments`

---

### `bookings`

**Owns:**
- Booking document lifecycle (PENDING → CONFIRMED → CANCELLED)
- Booking history (passenger)
- YatraPoints tracking
- Seat record updates on booking

**Collections owned:** `booktickets`, `seats` (shared with `seat-layouts`)

**Existing files:**
```
controllers/ticketController/ticketController.js     (booking + history portions — 2,109 lines)
controllers/adminController/ticket-controller/adminTicketController.js  (500 lines)
controllers/adminController/booking/bookingController.js  (214 lines)
models/bookTicketModel.js
models/seatsModel.js
models/yatraPointsHistoryModel.js
```

**Public operations:** `getBookingById`, `getPassengerBookings`, `createBooking`, `cancelBooking`

**Depends on:** `shared`, `trips`, `seat-holds`, `fares`, `users`

**Depended on by:** `payments`, `tickets`, `cancellations`, `refunds`, `settlements`, `notifications`

---

### `payments`

**Owns:**
- eSewa payment payload construction
- eSewa signature verification
- Transaction record management
- Disputed payment resolution

**Collections owned:** `transactions`

**Existing files:**
```
controllers/ticketController/paymentBookingController.js   (payment portion — 1,154 lines)
controllers/esewaPaymentVerification/esewaPaymentVerification.js (78 lines)
services/esewaService.js            (67 lines)
services/esewaVerificationService.js (139 lines)
models/transactionModel.js
controllers/adminController/disputedPaymentsController.js  (317 lines)
controllers/adminController/transactionController/transactionController.js (121 lines)
routes/paymentRoutes/paymentRoutes.js
```

**Public operations:** `preparePayment`, `verifyPayment`, `getTransactionById`

**Depends on:** `shared`, `seat-holds`, `bookings`, `wallet`

**Depended on by:** `bookings`, `tickets`, `refunds`, `wallet`, `notifications`

---

### `tickets`

**Owns:**
- Ticket creation (operator-defined ticket types)
- Conductor boarding confirmation
- Ticket view / download

**Collections owned:** (Needs confirmation — ticket records may be stored in `booktickets`)

**Existing files:**
```
controllers/ticketController/ticketController.js   (ticket portion)
controllers/adminController/ticket-controller/adminTicketController.js (ticket portion)
routes/ticketRoutes/ticketRoutes.js
```

**Public operations:** `getTicketByBookingId`

**Depends on:** `shared`, `bookings`, `trips`

**Depended on by:** `notifications`

---

### `cancellations`

**Owns:**
- Cancellation submission (passenger)
- Cancellation estimate preview
- Seat release on cancellation

**Collections owned:** None primary (updates `booktickets`)

**Existing files:**
```
controllers/ticketController/ticketController.js  (cancelTicket, cancelEstimate portions)
services/refundCalculatorService.js  (148 lines)
```

**Public operations:** `estimateCancellation`, `submitCancellation`

**Depends on:** `shared`, `bookings`, `fares`, `refunds`

**Depended on by:** `refunds`, `wallet`, `notifications`

---

### `refunds`

**Owns:**
- Refund queue (admin)
- Refund policy CRUD
- Refund status tracking

**Collections owned:** `refunds`, `refunddetails`, `refundpolicies`

**Existing files:**
```
controllers/adminController/refundController/adminRefundController.js   (294 lines)
controllers/adminController/refundPolicyController/refundPolicycontroller.js (209 lines)
services/refundCalculatorService.js   (148 lines)
models/refundModel.js
models/refundDetailsModel.js
models/refundPolicyModel.js
```

**Public operations:** `calculateRefund`, `getRefundPolicy`

**Depends on:** `shared`, `bookings`, `wallet`

**Depended on by:** `cancellations`, `wallet`, `admin`

---

### `wallet`

**Owns:**
- Passenger wallet balance
- Wallet transactions (credit/debit)
- Wallet PIN management
- Scratch card management (user-facing)
- SM Ledger (internal double-entry accounting for all financial events)

**Collections owned:** `wallets`, `wallettransactions`, `smledgers`, `scratchcards`

**Existing files:**
```
controllers/walletController/walletController.js       (189 lines)
controllers/walletController/scratchCardController.js  (127 lines)
controllers/adminController/walletController/adminWalletController.js  (556 lines)
services/walletService.js     (190 lines)
services/smLedgerService.js   (789 lines — split required)
models/walletModel.js
models/walletTransactionModel.js
models/smLedgerModel.js
models/scratchCardModel.js
```

**Public operations:** `getWalletBalance`, `creditWallet`, `debitWallet`, `recordLedgerEntry`

**Depends on:** `shared`, `users`

**Depended on by:** `bookings`, `payments`, `refunds`, `cancellations`, `referrals`, `coupons`, `settlements`

**Business invariants:**
- Every credit/debit must have a corresponding SM Ledger entry
- Wallet PIN must be set before PIN-verified operations

---

### `coupons`

**Owns:**
- Coupon catalogue (admin CRUD)
- Coupon validation and application (passenger)
- Coupon usage tracking
- Scratch card theme management

**Collections owned:** `coupons`, `couponusages`, `usercouponusages`

**Existing files:**
```
controllers/couponController/userCouponController.js           (431 lines)
controllers/couponController/recordCouponUsageController.js    (190 lines)
controllers/adminController/coupon-controller/adminCouponController.js  (777 lines)
controllers/adminController/scratchThemeController.js          (403 lines)
handlers/couponHelper.js    (395 lines)
models/couponModel.js
models/couponUsageModel.js
models/userCouponUsageModel.js
```

**Public operations:** `validateCoupon`, `recordCouponUsage`, `getBestCoupon`

**Depends on:** `shared`, `users`

**Depended on by:** `bookings`, `payments`

---

### `referrals`

**Owns:**
- Referral code management
- Referral reward processing
- Referral history

**Collections owned:** `referrals`, `referralv2s`

**Existing files:**
```
controllers/referralController/referralController.js   (392 lines)
services/referralV2Service.js    (642 lines)
middleware/autoGenerateReferralCode.js
handlers/referralCodeGenerator.js
routes/referralRoutes/referralRoutes.js
models/referralModel.js
models/referralV2Model.js
```

**Public operations:** `processReferralOnBooking`, `getReferralCode`

**Depends on:** `shared`, `users`, `wallet`

**Depended on by:** `bookings`

---

### `settlements`

**Owns:**
- Operator settlement requests (raise, list, mark received)
- Admin settlement approval / rejection
- Financial overview per operator brand
- Payment reconciliation cron

**Collections owned:** `settlements`, `agentsettlements`

**Existing files:**
```
controllers/busOwnerController/settlementController.js             (216 lines)
controllers/adminController/financialController/financialController.js  (460 lines)
services/brandFinancialService.js  (234 lines)
services/reconcilePayments.js      (97 lines)
models/settlementModel.js
models/agentSettlementModel.js
```

**Public operations:** `raiseSettlement`, `getSettlementsByOperator`

**Depends on:** `shared`, `operators`, `wallet`, `bookings`

**Depended on by:** `admin`

---

### `notifications`

**Owns:**
- Unified notification dispatch (push, email, SMS)
- Local (in-app) notification storage

**Collections owned:** `localnotifications`

**Existing files:**
```
controllers/notificationController/notificationController.js   (213 lines)
controllers/notificationController/notification_manager.js     (84 lines)
routes/pushNotification/pushNotification.js
emailManager/emailManager.js
handlers/sparro-otp.js
handlers/otp-template.js
handlers/password-email-template.js
handlers/agentStatusEmailTemp.js
handlers/busOwnerStatusEmailTemp.js
models/localNotificationModel.js
```

**Public operations:** `notify(userId, event, payload)`, `sendEmail(to, template, data)`, `sendSMS(phone, message)`, `sendPush(tokens, payload)`

**Depends on:** `shared`

**Depended on by:** All modules that need to communicate with users — `auth`, `kyc`, `bookings`, `payments`, `refunds`, `wallet`

**Business invariants:**
- Notifications must not block the calling request (fire-and-forget or async queue)

---

### `admin`

**Owns:**
- Admin authentication and MFA (TOTP via speakeasy)
- Super admin / admin / sub-admin management
- Platform configuration management
- Dashboard metrics
- Analytics
- Audit log viewing
- Role and permission management
- Partner lead management

**Collections owned:** `admins` (SuperAdmin model), `platformconfigs`, `adminauditlogs`, `partnerleads`

**Existing files:**
```
controllers/adminController/authController/auth-controller.js   (255 lines)
controllers/adminController/adminController.js                  (717 lines)
controllers/adminController/platformConfigController.js         (254 lines)
controllers/adminController/dashboardController/dashboardController.js   (221 lines)
controllers/adminController/analyticsController/analyticsController.js   (221 lines)
controllers/adminController/dashboardController/userDashboardController.js (107 lines)
controllers/partnerLeadController.js   (362 lines)
middleware/adminMiddleware.js
routes/adminRoutes/adminRoutes.js      (466 lines — split into per-domain sub-routers)
models/adminModel.js
models/platformConfigModel.js
models/adminAuditLogModel.js
models/PartnerLead.js
models/operatorBrandModel.js
```

**Depends on:** `shared`, all domain modules (read-only aggregation)

**Depended on by:** Nothing (leaf consumer)

---

### `audit`

**Owns:**
- Audit log writes (who did what, when, from where)
- Audit log reads (admin only)

**Collections owned:** `adminauditlogs`

**Existing files:**
```
models/adminAuditLogModel.js
(currently written inline from adminController — needs dedicated service)
```

**Public operations:** `logAdminAction(adminId, action, target, metadata)`

**Depends on:** `shared`

**Depended on by:** `admin`, `kyc`, `payments`, `refunds`

---

## Module Dependency Graph (simplified)

```
shared ←──────────────────────────────────── (all modules)

auth ←── users, agents, operators, admin
users ←── bookings, wallet, referrals, admin
agents ←── kyc, admin, settlements
operators ←── fleets, routes, trips, kyc, admin, settlements
stops ←── boarding-points, routes, trips, bookings
routes ←── trips, bookings, fares
fleets ←── trips, bookings
seat-layouts ←── fleets, trips, bookings
trips ←── seat-holds, bookings, payments, cancellations, staff
seat-holds ←── bookings, payments
fares ←── bookings, payments
bookings ←── payments, tickets, cancellations, refunds, settlements, notifications
payments ←── bookings, tickets, refunds, wallet, notifications
wallet ←── bookings, payments, refunds, cancellations, referrals, coupons, settlements
coupons ←── bookings, payments
referrals ←── bookings
refunds ←── cancellations, wallet, admin
cancellations ←── refunds, wallet, notifications
settlements ←── admin
notifications ←── (all modules needing user communication)
admin ←── (leaf — depends on all, nothing depends on admin)
audit ←── admin, kyc, payments, refunds
```
