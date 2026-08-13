# Seat Layout V3 persistence boundary

This boundary owns storage, lifecycle APIs, and the compatibility write path. It does not
change the current V2 user interfaces or passenger read contract yet.

## Records

- `SeatLayoutTemplate` is the stable platform or operator template identity.
- `SeatLayoutRevision` is an immutable physical layout revision. Changes create another revision.
- `FleetSeatLayoutAssignment` identifies the published revision currently used by one fleet.
- `FleetSeatLayoutChangeRequest` keeps the old assignment active until an admin approves a change.
- `TripSeatLayoutSnapshot` permanently captures layout, availability, and fares for one trip.

Platform templates can be adopted into an operator-owned template only from their published
revision. An operator edit creates a new draft and cannot overwrite that inherited revision.

## Safety rules

- Physical revisions and trip snapshots cannot be deleted.
- Revision numbers use an atomic template counter rather than `count + 1`.
- Only published revisions can be newly assigned.
- A fleet already assigned to a retired revision may continue generating trips from it.
- Fleet changes require a pending request and super-admin approval.
- A trip snapshot is created once; later template or fleet changes cannot alter it.
- Pricing is explicitly `PRICED` or `UNPRICED`; a missing fare is never stored as zero.
- Platform templates must be adopted into an operator-owned template before fleet use.
- New trips write legacy seat inventory and, when assigned, a V3 snapshot in one transaction.

## Compatibility

The migration planner is read-only and reports invalid legacy layouts instead of inventing
seat identities. Authenticated `/seat-layout-v3` admin and owner endpoints now expose the
new lifecycle. The read resolver prefers V3 snapshots, but the passenger endpoint retains
current V2 template-then-fleet priority until the later read-cutover stage. Fleets without
a V3 assignment continue using only the legacy seat inventory during the transition.
