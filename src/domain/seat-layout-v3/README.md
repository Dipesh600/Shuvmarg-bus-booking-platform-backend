# Seat Layout V3 domain contract

This module defines physical vehicle layout only. Persistence and lifecycle wiring live
in the separate `seat-layout-v3-persistence` module so live trip state cannot leak into
the physical contract.

## Boundary

- `LayoutSection` represents an independently sized physical area, such as the
  lower cabin or upper berth level.
- `SEAT` and `BERTH` are physical passenger-place forms.
- Comfort, commercial class, and accessibility are separate attributes.
- Live availability, booking state, fare, holds, and withdrawal workflow do not
  belong in this contract.

This separation allows a lower cabin to contain regular seats while a smaller upper
section contains only four to eight berths.

## Compatibility

`adaptLegacySeatLayout()` converts the existing V2 `floors/rows/cells` structure
without mutating it. Legacy `isActive` values are returned separately as migration
availability evidence. They are never copied into the V3 physical layout.

Invalid legacy passenger places are reported rather than silently assigned invented
labels or identities.

## Current stage

Stage 1 provides validation, canonicalization, fingerprinting, fixtures, and legacy
adaptation. Stage 2 adds immutable persistence. Stage 3 exposes authenticated admin and
operator lifecycle APIs and atomically captures V3 snapshots for newly generated trips
whose fleets have a V3 assignment. Passenger read cutover and the new builder UI remain
separate, explicit rollout stages.
