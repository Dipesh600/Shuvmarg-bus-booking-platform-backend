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

Internal keys:
- `seatKeys`: `["<tripId>:<seatNo>", ...]` (multikey array)
- `userTripKey`: `"<userId>:<tripId>"`

Both keys use `select: false` and `default: undefined` so legacy documents remain unindexed until upgraded.

### 3. Hold Lifecycle & Atomic State Transitions
- **Preparation / Hold Acquisition**:
  1. Expired holds (both user-trip and seat keys, plus legacy) are deleted.
  2. Passenger's existing active hold for the same trip is checked:
     - If legacy hold (lacking `seatKeys`): atomically upgraded with canonical keys.
     - If exact same seat set: returns existing `tempBookingId` and `expiresAt` (expiry NOT extended).
     - If different seat set: atomically updates seats & keys while preserving `tempBookingId` & `expiresAt`.
  3. Otherwise creates a new hold with cryptographically random `tempBookingId` (`BH` + hex).
  4. Concurrent conflicts trigger `409 SEAT_TEMPORARILY_HELD`.

- **Confirmation Middleware (`requireOwnedActivePassengerSeatHold`)**:
  - Validates `tempBookingId` belongs to authenticated `req.dbUser._id` and is active (`status: "held"`, `expiresAt > now`).
  - Missing/expired/unowned holds return neutral `409 BOOKING_HOLD_INVALID`.
  - Compares optional client `scheduleId` & `seatNumbers` against hold canonical values; returns `409 BOOKING_HOLD_MISMATCH` on discrepancy.
  - Attaches canonical hold to `req.bookingHold`.

- **Completion Timing (`completePassengerHold`)**:
  - Executed only after payment verification, seat locking, `Booking.create()`, and `Transaction` updated to `SUCCESS`.
  - Atomically sets `status: "completed"` and `completedAt: now`, while unsetting `seatKeys` and `userTripKey` to release unique index locks.

### 4. Legacy Booking Retirement
`/api/ticket/bookTicket` is retired via explicit `retireLegacyBookingFlow` handler and returns `410 LEGACY_BOOKING_FLOW_RETIRED`.
