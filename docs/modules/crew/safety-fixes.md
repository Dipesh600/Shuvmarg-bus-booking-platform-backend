# Driver and conductor safety fixes

## Scope

This change repairs existing crew onboarding, removal, approval, assignment and boarding paths and implements separate operator and Super Admin management workspaces. It does not implement mobile driver/conductor workspaces, duty rosters, payroll, attendance, multi-brand employment or overlap detection.

## Changed behavior

- Crew account and profile writes use one MongoDB transaction. Invitations are attempted only after commit. Repeat assignments reuse the profile; send `resendInvite: true` on the existing assignment endpoint to retry notification. Responses report `QUEUED`, `FAILED` or `NOT_REQUESTED`; queued is not proof of delivery. Both role endpoints share a per-owner request limit.
- New accounts remain invited until phone-OTP activation. SMS instructions explain how to start activation in the existing Partner sign-in screen. No generated password is disclosed. Existing accounts retain their password, account status and sessions. Passwordless existing accounts must set a password through account recovery before provisioning; the response uses `CREW_PASSWORD_SETUP_REQUIRED`.
- Removing crew deactivates only that profile, clears its current assignments, and records the owner/time. It never deactivates the shared User or revokes unrelated sessions. Admin suspension survives removal. A compliant driver rehire becomes ready after the automated checks pass.
- The existing single-brand crew constraint is retained. Conflicting links fail explicitly. Driver onboarding can attach a matching unlinked admin registry profile (same owner, brand, phone and license number) without replacing its documents. An admin registry entry alone does not provide app login.
- Conductor manifest and boarding access require an active, nonremoved profile explicitly assigned to that trip, with matching brand and owner. Owners retain access only to their own trips. Only `booked` tickets appear or can be boarded; first boarding is an atomic, idempotent write.
- Trip state is stored as `in-transit`; the legacy `in_transit` input is normalized. Driver assignment and entry into boarding/departure validate current approval, operational status, removal state, brand, license evidence and expiry. Medical evidence remains optional under the existing contract, but any supplied certificate needs valid evidence and expiry. Expiry includes its calendar day in Nepal.
- Driver checks apply to bus assignment, direct trip assignment/update, fleet workstation and schedule assignment/lifecycle. Generated and extra-run trips inherit only an eligible default driver; otherwise they remain unassigned and require a replacement before operating.
- New drivers do not enter a separate review queue. A valid licence must pass content validation, malware scanning, processing and final output verification before the profile is automatically marked ready. Admin identity is still recorded for Admin-created or Admin-corrected records, and document saves use optimistic concurrency so stale writes cannot override a concurrent edit/removal.
- Document previews resolve the stored evidence through the admin-authenticated driver/slot endpoint. They do not accept an arbitrary storage key. Uploads use unique keys; failed requests clean up only known uncommitted new objects. Ambiguous database-write failures retain uploaded objects for reconciliation instead of risking deletion of committed evidence.
- Super Admin staff management is separate from the Bus Owner workspace. Admins can create or connect conductor accounts for a selected brand, edit administrative details, retry activation invitations, view trip-access summaries, and suspend or restore service with recorded history. Admins cannot clear an on-trip state or undo an operator removal; operator rehire remains an owner workflow.

## Endpoints added

All operator endpoints below inherit authentication, current role checks and approved-owner authorization.

- `PUT /api/busowner/conductors/:profileId/trips/:tripId`: idempotently assign a nonterminal, same-brand owned trip.
- `DELETE /api/busowner/conductors/:profileId/trips/:tripId`: remove that trip assignment.
- `GET /api/admin/drivers/:id/documents/:slot/view`: authenticated preview; slot is `license`, `medical` or `photo`.
- `GET /api/busowner/crew`: owner-scoped, role-specific crew directory with server pagination and filters.
- `PATCH /api/busowner/crew/:role/:profileId/status`: owner-controlled AVAILABLE/OFF_DUTY status changes.
- `POST /api/admin/conductors`: admin-authenticated conductor onboarding or invitation retry for an active brand.
- `GET /api/admin/brands/:brandId/conductors`: brand-scoped Admin staff registry.
- `GET /api/admin/conductors` and `GET /api/admin/conductors/:id`: platform and detail reads.
- `PATCH /api/admin/conductors/:id`: administrative identity/notes edit with linked phone protection.
- `PATCH /api/admin/conductors/:id/status`: audited Admin suspension or controlled restoration.

## Rollout requirements and remaining limits

1. MongoDB must support transactions (replica set or sharded deployment). There is no nontransactional fallback.
2. Audit existing conductor trip assignments before rollout; empty `assignedTripIds` no longer grants brand-wide access.
3. Review legacy approved drivers missing evidence, valid dates or usable private storage keys. They now fail eligibility checks; secure preview may require re-upload.
4. Do not silently repair globally inactive accounts left by the old removal behavior: support must distinguish those from intentional bans/suspensions.
5. The database tests use a disposable local replica set. Live SMS delivery, private storage reads and browser interactions still require a staging smoke test.
6. Schedule/driver availability overlap, role-specific invitation acceptance, durable notification retry queues and historical crew audit dashboards remain separate work.
