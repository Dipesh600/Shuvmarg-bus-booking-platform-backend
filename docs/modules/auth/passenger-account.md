# Passenger Account Module

`src/modules/auth/passenger-account/`

---

## Purpose

Resolves a verified phone number to a passenger `User` account.

This module is a **pure backend primitive** — it does not handle OTP verification, issue tokens, build HTTP responses, or expose a public route. It is called by the upcoming passenger OTP authentication module after phone ownership has been confirmed.

---

## Why this module exists

The existing `src/modules/auth/registration/` flow requires a full profile:

```
phone + name + password + address + gender
```

It also rejects any phone that already exists. It is the public new-user sign-up contract and **must not change**.

The passenger OTP login flow requires a different primitive:

```
phone (already verified) → account exists or is created → return User
```

No password. No profile required. The account is minimal and progressive — the passenger fills in profile and password later through existing endpoints.

---

## Architecture

```
src/modules/auth/passenger-account/
├── index.js                          Public API
├── passenger-account.errors.js       Controlled domain errors (AppError)
├── passenger-account.policy.js       Pure decision functions (no DB)
├── passenger-account.repository.js   All User model access
└── passenger-account.service.js      Orchestrator
```

---

## Public API

```js
const { resolvePassengerAccountAfterPhoneVerification } =
  require('./src/modules/auth/passenger-account');

const user = await resolvePassengerAccountAfterPhoneVerification({
  phone: rawPhone,   // any supported format — normalized internally
  now: new Date(),   // used for roleActivatedAt
});
```

Returns a lean User document with passenger role.

**Precondition**: The caller must have verified phone ownership via OTP before calling this function. The function name communicates this requirement.

**This function does not**:
- Verify OTPs
- Issue tokens
- Build HTTP responses
- Create public routes

---

## Three resolution cases

### Case A — New phone

No existing User for this phone.

```
validate phone → create minimal User →
  { phone, role: "passenger", roles: ["passenger"],
    phoneVerified: true, isVerified: true, status: "active" }
→ return saved User
```

The pre-save hook normalizes the phone and backfills `roleActivatedAt`.

### Case B — Existing user, passenger role absent

User exists (agent, busOwner, etc.) but does not hold `passenger`.

```
validate phone → find identity (including deleted) →
check restrictions → atomic addPassengerRoleIfMissing →
return updated User (or re-read on concurrent race)
```

### Case C — Existing user, already a passenger

Idempotent — return without any writes.

```
validate phone → find identity → passengerRoleAlreadyGranted → return existing
```

An existing passenger with a missing `roleActivatedAt.passenger` timestamp is **not** silently modified. A separate migration handles legacy data.

---

## Account-status policy

| Status | Allowed |
|---|---|
| `active` | ✅ |
| `pending` | ✅ (status not changed) |
| `invited` | ❌ blocked (403) |
| `inactive` | ❌ blocked (403) |
| `banned` | ❌ blocked (403) |
| `deletedAt` present | ❌ blocked (403) |

Role-specific application approval lives in `Agent` / `BusOwner` profile records, not in `User.status`.

---

## Phone lookup

Uses `buildPhoneQuery(rawPhone, { includeDeleted: true })` (from `utils/phoneGuard`).

- Searches both raw and normalized phone forms.
- Includes soft-deleted records so a deleted identity is found and blocked rather than causing a duplicate-User creation.
- The caller passes the raw phone; normalization happens internally.

---

## Concurrency safety

### New-user creation race

Two concurrent verified requests for the same new phone both find no existing User and attempt to create one. Only one succeeds. The other receives `E11000` on the unique phone index.

Recovery:
1. Detect `err.code === 11000 && err.keyPattern.phone`.
2. Re-read the winning User by normalized phone.
3. Check the winner is not restricted.
4. If the winner has passenger, return it.
5. If not, run normal role-grant.

E11000 on email or any other index is **not** treated as a phone race.

### Role-grant race

Two concurrent requests for the same existing user without passenger both call `addPassengerRoleIfMissing`. The conditional filter `{ _id, roles: { $ne: "passenger" } }` ensures only the first succeeds. The second returns `null`.

Recovery:
1. `addPassengerRoleIfMissing` returns `null`.
2. Re-read by `findByIdForPassengerResolution`.
3. Return the current state.

The first activation timestamp is always preserved — the second write is rejected by the filter.

---

## Shared policy dependency

The module uses `src/shared/auth/account-role.policy.js` indirectly (via the User model's password validator). The service-level policy is in `passenger-account.policy.js`.

---

## Minimal → Full lifecycle

```
OTP Login  →  minimal account (phone only)
                   ↓
           PATCH /profile  →  name, address, gender, email
           (existing src/modules/auth/profile)
                   ↓
           POST /update-password  →  set password
           (existing src/modules/auth/update-password)
                   ↓
           Full passenger account
                   ↓
           Agent / BusOwner upgrade flows (existing modules, unchanged)
```

---

## Related modules

| Module | Relationship |
|---|---|
| `src/modules/auth/registration/` | Original passenger sign-up (full profile + password). Unchanged. |
| `src/modules/auth/profile/` | Profile completion. Used after OTP login. |
| `src/modules/auth/update-password/` | Password creation after passwordless login. |
| `src/shared/auth/account-role.policy.js` | Platform-wide password requirement policy. |
| `utils/phoneGuard.js` | Normalization and `buildPhoneQuery`. |

---

## Tests

| File | Coverage |
|---|---|
| `tests/unit/shared/account-role-policy.test.js` | Shared policy pure functions |
| `tests/unit/auth/user-model-passwordless.test.js` | User model conditional password validator |
| `tests/unit/auth/passenger-account-repository.test.js` | Repository query contracts |
| `tests/unit/auth/passenger-account-service.test.js` | Full service cases, concurrency, restrictions |

Run:
```bash
npm run test:passenger-account
```
