# Passenger Seat Hold & Booking Authorization Domain Module

## Overview
The `passenger-seat-hold` domain module establishes a mandatory passenger authentication boundary and an atomic, database-enforced seat-hold ownership system for online ticket bookings.

## Architecture

### 1. Identity & Role Boundary (`passengerBookingGuard`)
Applied to `/prepareBooking`, `/confirmBooking`, `/verifyBooking/:ticketId`, and retired `/bookTicket`:
- Requires valid JWT authentication (`auth`).
- Re-verifies current database account status (`verifyRoleFromDB`).
- Enforces explicit `activeRole: "passenger"` (`role.requireRole("passenger")`).
- Tokens with active roles like `agent` or `busOwner` receive `403 INSUFFICIENT_ROLE`.

### 2. Single-Field Sparse Unique Indexes
Configured on `SeatHold` collection via `scripts/ensurePassengerSeatHoldIndexes.js`:
- `uniq_active_trip_seat_hold`: `{ seatKeys: 1 }, { unique: true, sparse: true }`
- `uniq_active_user_trip_hold`: `{ userTripKey: 1 }, { unique: true, sparse: true }`

CLI Migration Execution:
- Requires `process.env.MONGODB_URL` from environment/`.env`. Fails immediately if missing without fallback to localhost.
- Logs database name without revealing credentials.
- Always disconnects in a `finally` block and exits with non-zero status code on failure.

Internal keys:
- `seatKeys`: `["<tripId>:<seatNo>", ...]` (multikey array)
- `userTripKey`: `"<userId>:<tripId>"`

Both keys use `select: false` and `default: undefined` so legacy documents remain unindexed until upgraded.

### 3. Hold Lifecycle & Atomic State Transitions
- **Supported Payment Gateways Allow-List**:
  - `SUPPORTED_BOOKING_GATEWAYS = new Set(["esewa", "wallet"])`.
  - Unsupported or malformed gateway values (`cash`, `test`, `khalti`, `stripe`, `""`, `null`, `{}`, `[]`) are rejected immediately with HTTP `400 UNSUPPORTED_PAYMENT_GATEWAY` before any coupon lookup, SM Money balance check, debit, or database mutation.

- **Hold Acquisition & Legacy Canonicalization**:
  1. Expired holds (both user-trip and seat keys, plus legacy) are deleted.
  2. Passenger's existing active hold for the same trip is checked:
     - Active legacy holds (lacking `seatKeys`) are atomically upgraded with canonical keys before returning.
     - If exact same seat set: returns existing `tempBookingId` and `expiresAt` (expiry NOT extended).
     - If different seat set: atomically updates seats & keys while preserving `tempBookingId` & `expiresAt`.
     - Re-read holds are guaranteed to be canonical (`seatKeys` present/non-empty, `userTripKey` present, `status === "held"`, `expiresAt > now`).
  3. Otherwise creates a new hold with cryptographically random `tempBookingId` (`BH` + hex).
  4. Concurrent conflicts trigger `409 SEAT_TEMPORARILY_HELD`.

- **Confirmation Middleware (`requireOwnedActivePassengerSeatHold`)**:
  - Validates `tempBookingId` belongs to authenticated `req.dbUser._id` and is active (`status: "held"`, `expiresAt > now`).
  - Missing/expired/unowned holds return `409 BOOKING_HOLD_INVALID`.
  - Compares optional client `scheduleId` & `seatNumbers` against hold canonical values; returns `409 BOOKING_HOLD_MISMATCH` on discrepancy or malformed optional input (`scheduleId: ""`, `seatNumbers: "A1"`, `[]`, `[null]`).
  - Attaches canonical hold to `req.bookingHold`.

- **Confirmation Lifecycle & Reconciliation Boundaries**:
  - States: `PRE_PAYMENT`, `PAYMENT_RECEIVED`, `SEATS_LOCKED`, `BOOKING_CREATED`, `BOOKING_COMMITTED`.
  - `bookingCreated = true` is set immediately after `Booking.create()` succeeds.
  - `bookingCommitted = true` is set ONLY after `Transaction` status transitions to `SUCCESS`.
  - If `Transaction.findOneAndUpdate` returns `null` or throws, system returns `409 BOOKING_RECONCILIATION_REQUIRED` with `caseId: txnRecord._id` without undoing created booking, reversing payment, or releasing locked seats.
  - Outer `catch(error)` evaluates lifecycle:
    - `bookingCommitted === true`: preserves booking/seats/payment and returns `201` if response not sent.
    - `bookingCreated === true`: enters reconciliation, returning `409 BOOKING_RECONCILIATION_REQUIRED`.
    - `bookingCreated === false`: performs pre-booking compensation (reverses SM debit, marks transaction `DISPUTED`, rolls back locked seats).

- **Completion Timing (`completePassengerHold`)**:
  - Executed post-commit in an isolated `try/catch` block (`req.bookingHold._id`, `req.dbUser._id`).
  - Failure in hold completion or other post-commit tasks (cashback, notifications) logs warnings without changing the `201` booking success response.

### 4. Legacy Booking Retirement & Known Limitations
- `/api/ticket/bookTicket` is retired via explicit `retireLegacyBookingFlow` handler and returns `410 LEGACY_BOOKING_FLOW_RETIRED`.

- **Known Limitations**:
  - `/api/ticket/getSeats` is public with optional access-token authentication.
    Anonymous passengers see every active hold as reserved; authenticated
    passengers do not have their own active holds masked as unavailable.
  - `prepareBooking` still does not validate `boardingPoint`.
  - `prepareBooking` still does not validate `droppingPoint`.
  - `prepareBooking` still does not validate `passengerDetails`.
  - Fare calculation is still not server-authoritative.
