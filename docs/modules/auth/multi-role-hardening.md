# Multi-role identity and authorization

Keep one User per normalized phone and stable user ID. Keep owner, agent and crew details in their existing profiles; operator, brand and trip assignments determine resource access. A role list alone never proves ownership or operational approval.

## Role authority

- `roles` is authoritative whenever present. An empty array means no granted roles. Null or malformed role state fails closed.
- Only an absent `roles` field supports the legacy `role` fallback. New documents materialize that role before validation. Normal saves reject an empty list rather than restoring permissions.
- `role` records the original registration role. It must not be re-added by saves or used to issue a session after removal from `roles`.
- Session issuance validates the requested active role. With no requested role, it chooses a currently held role. Each access check compares the session role to current database membership.
- Revoking one role preserves other memberships. Whole-account bans, deletion, forced password changes and session invalidation remain account-wide. Role profile suspensions and assignment removals remain separate.
- Passenger enrollment after verified phone ownership is an explicit grant flow. Removing its role alone does not prohibit subsequent passenger enrollment; use the account restriction workflow when enrollment itself must be blocked.

## Session and endpoint changes

Refresh rejects inactive, invited, banned, deleted and forced-password-change accounts. Only the request that successfully deletes the old refresh-token record can issue a replacement, including concurrent requests. The session keeps its original active role across rotation. Wrong-portal refresh rejection occurs before consuming the token.

Private ticket history/cancellation, reviews, referrals, device/notification and map-write routes now check current account and role state, alongside their existing resource checks. Broadcast notifications now require the separate administrator identity; ordinary account roles cannot send to all devices. Public reads remain public. Owner approval, agent verification and crew assignment checks remain in their existing operational modules.

## Deployment compatibility

Before deploying, run `node scripts/preflightAccountRoles.js` using the intended environment's database configuration. This script reads only, disables automatic collection/index creation, and reports counts plus a capped sample of user IDs. Exit 2 means empty or malformed role data needs review; exit 1 means inspection failed.

Older code treated an explicit empty role array as legacy in some login flows, but as revoked during refresh. The new behavior consistently denies it. Review any affected records against approved role profiles and revocation history. Restore only specifically verified grants through the authorized onboarding/admin flow; do not automatically copy the historical role into every empty list. Missing role fields remain compatible. A historical role absent from a nonempty list is valid revocation state and does not require repair.

No production database changes or deployment are performed by this code change. Run the preflight against production before rollout; local regression tests use disposable databases.

## Regression coverage

`tests/characterization/multi-role-hardening.test.js` exercises persisted role removal, subsequent saves, active-role isolation, missing legacy fields, empty-role denial, blocked account refresh/access and simultaneous refresh requests. Existing authentication, enrollment, password-reset, ownership and crew suites cover integration with their respective flows.

## Validation on 2026-09-05

- Combined authentication, role, crew, ownership and private booking regression run: 1,008 tests passed, zero failures.
- Persisted-data preflight and legacy-repair race tests: 4 passed, zero failures. The preflight leaves the raw collection unchanged.
- `git diff --check`: passed.
- Repository-wide `node tools/check-file-size.js`: still reports 11 oversized files in the existing crew/activation workspace changes (including the crew assignment service that now uses the shared role policy). The new hardening files satisfy the size limit. These remaining repository violations must be resolved before the full CI/deployment gate can pass.
- The production data preflight has not been run; no production data or deployment was changed.
