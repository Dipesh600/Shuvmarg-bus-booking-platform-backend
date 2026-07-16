# Test Gap Analysis
**Branch:** `refactor/foundation`  
**Commit:** `df5a7f2`  
**Generated:** 2026-07-16

---

## 1. Current State

| Metric | Value |
|---|---|
| Automated test framework configured | ❌ No (`package.json` test script: `echo "Error: no test specified" && exit 1`) |
| Automated test runner (jest, mocha, etc.) | ❌ None installed |
| Existing test files | ✅ 1 (`tests/authSecurityTest.js` — integration test, 386 lines) |
| Test execution style | Manual — `node tests/authSecurityTest.js` against running local server |
| Code coverage tracking | ❌ None |
| CI/CD test gate | ❌ None (no `.github/workflows/*.yml` found) |

---

## 2. What the Existing Test File Covers

**`tests/authSecurityTest.js`** is a single-file HTTP integration test suite that runs against `localhost:7012`.

| Test case | Covered endpoint | Status |
|---|---|---|
| Phone guard blocks cross-entity registration | `POST /api/sendPhoneOTP` | ✅ (manual only) |
| OTP purpose mismatch rejected | OTP verify | ✅ |
| Password policy enforced | `POST /api/completeRegistration` | ✅ |
| Refresh token rotation works | `POST /api/refresh` | ✅ |
| Logout revokes session | `POST /api/logout` | ✅ |
| `verifyRoleFromDB` blocks stale tokens | Any protected route | ✅ |
| Admin JWT has 8h expiry | `POST /api/admin/auth/login` | ✅ |
| `forcePasswordChange` detection | `POST /api/changeForcePassword` | ✅ |
| Token service unit tests (inline) | N/A — inline assertions | Partial |

**This file tests the authentication security overhaul only.** It does not cover booking, payment, fleet, trips, or any other business domain.

---

## 3. Critical Path Endpoints With Zero Test Coverage

The following endpoints are in the **primary revenue and trust flow**. None have any automated tests:

### 3a. Trip Search (Pre-booking)

| Endpoint | Importance | Risk Without Tests |
|---|---|---|
| `POST /api/public/searchTrips` | **Critical** — highest traffic endpoint | Any refactor of `ticketController.searchTrips` or `tripService.searchTrips` is invisible to CI |
| `POST /api/public/computeFare` | High | Fare calculation regression could silently charge wrong amounts |

### 3b. Booking Flow

| Endpoint | Importance | Risk Without Tests |
|---|---|---|
| `POST /api/ticket/prepareBooking` | **Critical** | Seat hold failure = revenue loss + double-booking risk |
| `POST /api/ticket/confirmBooking` | **Critical** | Payment confirmation failure = money charged, no ticket issued |
| `POST /api/ticket/bookTicket` (legacy) | High | Legacy flow still used by some clients |
| `GET /api/ticket/getSeats` | High | Seat map display, drives conversion |
| `GET /api/ticket/getMyTicketHistory` | Medium | Passenger record view |

### 3c. Cancellation and Refund

| Endpoint | Importance | Risk Without Tests |
|---|---|---|
| `POST /api/ticket/cancelEstimate` | High | Wrong refund estimate = passenger dispute |
| `POST /api/ticket/cancelTicket` | **Critical** | Booking stays CONFIRMED while money refunded, or vice versa |
| `GET /api/admin/refunds` | Medium | Admin refund queue |
| `PATCH /api/admin/refunds/:id/approve` | High | Double-credit risk if idempotency not enforced |

### 3d. Payment Gateway

| Endpoint | Importance | Risk Without Tests |
|---|---|---|
| `POST /api/payment/verify` | **Critical** | eSewa callback — signature verification regression = fraudulent bookings accepted |

### 3e. Wallet

| Endpoint | Importance | Risk Without Tests |
|---|---|---|
| Wallet credit after booking | **Critical** | Cashback discrepancy damages trust |
| Wallet debit on booking with wallet | **Critical** | Double-debit risk |

### 3f. Registration and Login

| Endpoint | Importance | Risk Without Tests |
|---|---|---|
| `POST /api/sendPhoneOTP` | High | Already in authSecurityTest but not repeatable without server |
| `POST /api/login` | **Critical** | Login regression blocks all authenticated traffic |
| `POST /api/refresh` | **Critical** | Token rotation failure logs out all users |

---

## 4. Domain Coverage Map

| Domain | Current Coverage | Minimum Required Before Refactoring |
|---|---|---|
| Auth (user) | Partial — manual only | Automated: login, refresh, logout, registration, password reset |
| Auth (agent) | Zero | Automated: login, registration |
| Auth (bus owner) | Zero | Automated: login, registration |
| Admin auth | Zero | Automated: login, MFA |
| Fleet | Zero | Smoke: submit fleet, approve fleet (admin) |
| Routes | Zero | Smoke: create route, search stops |
| Trips | Zero | Smoke: create schedule, search trips |
| Seat holds | Zero | Automated: create hold, confirm hold |
| Bookings | Zero | **Automated: happy path booking, history** |
| Payments | Zero | **Automated: prepareBooking, confirmBooking, eSewa sig verify** |
| Cancellations | Zero | Automated: cancelEstimate, cancelTicket |
| Refunds | Zero | Automated: admin refund approve |
| Wallet | Zero | Automated: credit after booking, balance after debit |
| Coupons | Zero | Smoke: validate coupon |
| Referrals | Zero | Smoke: referral link generation |
| Settlements | Zero | Smoke: raise settlement |
| Notifications | Zero | Smoke: confirm email sent after booking |
| KYC | Zero | Smoke: agent approval email sent |

---

## 5. Minimum Test Suite Required Before Each Refactor PR

Each PR in the migration sequence must have the following tests passing before the PR is merged:

| PR | Minimum characterization tests |
|---|---|
| PR-2 (auth middleware) | `POST /api/login` 200/401, protected route 401 without token |
| PR-3 (OTP utilities) | `POST /api/sendPhoneOTP` 200, rate limit 429 |
| PR-4 (login) | `POST /api/login` with valid and invalid credentials |
| PR-5 (session) | `POST /api/refresh` rotation, `POST /api/logout` + subsequent refresh 401 |
| PR-6 (registration) | OTP → verify → register (happy path); duplicate phone rejection |
| PR-7 (password reset) | Reset flow happy path; wrong OTP rejected |
| PR-9 (admin auth) | Admin login 200; admin login without 2FA; MFA flow |
| PR-10 (agent auth) | Agent registration + login |
| PR-11 (bus owner auth) | Bus owner registration + login |
| PR-15 (trips + cron) | searchTrips returns results; schedule creation |
| PR-16 (seat holds) | prepareBooking creates hold; expired hold rejects confirmBooking |
| PR-17 (bookings) | bookTicket creates booking; getMyTicketHistory returns correct data |
| PR-18 (payments) | confirmBooking with valid eSewa response; eSewa sig verify rejects tampered sig |
| PR-19 (cancellations) | cancelEstimate returns breakdown; cancelTicket changes status |
| PR-20 (wallet) | Wallet credit after booking; SM Ledger entry created |

---

## 6. Recommended Test Strategy

### Phase A — Characterization Tests (Before Refactor)

Add a **characterization test** for each critical endpoint before any production code is moved. Characterization tests:
- Prove the current behavior
- Run against a test database (in-memory MongoDB via `mongodb-memory-server`, or a separate test Atlas cluster)
- Live in `tests/characterization/`
- Use the existing `authSecurityTest.js` pattern (pure Node `http` — no new framework needed)

Start with:
1. `tests/characterization/auth.test.js` — login, refresh, logout, registration
2. `tests/characterization/search.test.js` — searchTrips happy path
3. `tests/characterization/booking.test.js` — prepareBooking, confirmBooking (mock eSewa response)

### Phase B — Test Runner (Recommended: Jest or Node Test Runner)

Install `jest` as a dev dependency and wire it to `package.json`:

```json
{
  "scripts": {
    "test": "jest --runInBand",
    "test:watch": "jest --watch"
  },
  "devDependencies": {
    "jest": "^29.0.0",
    "mongodb-memory-server": "^9.0.0",
    "supertest": "^7.0.0"
  }
}
```

No TypeScript required — Jest works with CommonJS natively.

### Phase C — CI Gate

Add a GitHub Actions workflow (`.github/workflows/test.yml`):

```yaml
name: Test
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - run: npm test
```

This gates every PR on the `dev` branch.

---

## 7. eSewa Integration Test Approach

The eSewa gateway requires:
1. A valid merchant code and secret key (test credentials exist in eSewa sandbox)
2. HMAC-SHA256 signature generation

**Testing approach:**
- For unit tests: mock the eSewa verification call and test with a known-valid signed response
- For integration tests: use eSewa sandbox keys (store in `.env.test`, never commit)

The `services/esewaVerificationService.js` (139 lines) is the boundary to mock.

---

## 8. OTP Test Approach

Real SMS/OTP calls must be skipped in tests:
- Intercept at `handlers/sparro-otp.js` — inject a `TEST_OTP_CODE` environment variable
- When `NODE_ENV=test`, OTP service returns `TEST_OTP_CODE` instead of calling the Sparro API

This pattern is already partially supported by checking for `NODE_ENV` in the OTP helpers — verify and formalize.

---

## 9. Current Risk Exposure Summary

| Risk Area | Severity | Description |
|---|---|---|
| Payment confirmation regression | **Critical** | No test catches a change that breaks eSewa sig verify — fraudulent bookings could be confirmed |
| Booking status desync | **Critical** | Refactoring cancel flow without tests could leave bookings in inconsistent states |
| Token rotation breakage | **Critical** | A bad `require()` path in auth middleware fails silently until login |
| Wallet double-credit | **High** | Wallet service and ledger service can both credit on the same event if refactored badly |
| Trip generation cron failure | **High** | No test catches a broken trip cron — no trips generate for the next 30 days |
| Rate limiter bypass | **High** | Moving OTP limiter middleware without verifying route registration order |
