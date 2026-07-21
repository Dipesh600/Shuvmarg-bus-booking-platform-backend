# Passenger OTP Authentication

[Back to auth module documentation](README.md)

## Purpose

Public two-step OTP authentication for passenger accounts. No password required.

Handles three identity cases:

| Case | What happens |
|---|---|
| New phone | Minimal passenger account created by the resolver |
| Existing passenger | Session issued directly |
| Existing non-passenger (agent / bus owner) | Passenger role granted by resolver; session issued |

## Routes

Mounted at `/api/auth/passenger` by `routes/indexRoute.js`.

| Method | Path | Description |
|---|---|---|
| POST | `/sendOTP` | Send a passenger authentication OTP |
| POST | `/verifyOTP` | Verify OTP and receive an authenticated session |

No JWT is required for either endpoint.

## Module structure

```
src/modules/auth/passenger-otp-auth/
├── index.js                          Public surface (controller re-export)
├── passenger-otp-auth.controller.js  HTTP layer
├── request-passenger-otp.service.js  OTP send orchestration
├── verify-passenger-otp.service.js   OTP verify + session creation
├── passenger-otp-auth.repository.js  Data access (eligibility, session state, repair)
├── passenger-otp-auth.mapper.js      Allow-list response mapper
├── passenger-otp-auth.policy.js      Pure helpers (validation, error classification)
└── passenger-otp-auth.errors.js      AppError factories
```

## OTP purpose

`PASSENGER_AUTH` — isolated from `BUSOWNER_REGISTRATION`, `AGENT_REGISTRATION`, and `PASSWORD_RESET`. A code obtained for one purpose cannot be used to authenticate for another.

## SMS eligibility guard

Before calling `createAndSendOTP`, the request service looks up the phone in the User collection (including soft-deleted records). Accounts with `status: banned | inactive | invited` or `deletedAt` non-null receive the same neutral 200 response without any SMS being sent. This prevents billing for OTPs that can never complete authentication while preserving phone-number enumeration protection.

## Session-creation sequence

```
POST /verifyOTP
→ validate inputs (phone present, OTP 6 digits)
→ normalize phone (strip +977 / 977 / leading 0)
→ verify PASSENGER_AUTH OTP (atomic one-time consumption)
→ resolvePassengerAccountAfterPhoneVerification()
→ loadPassengerSessionState()  — includes password-presence check
→ derive effective roles via getEffectiveRoles()
→ materializeLegacyPassengerRole() if roles[] missing passenger
→ reload session state if repaired
→ enforce account restrictions (deleted / banned / inactive / invited)
→ enforce forcePasswordChange gate
→ recordPassengerLogin()
→ generateTokenPair(user, { activeRole: 'passenger' })
→ 200 + httpOnly refreshToken cookie
```

## Response contract

```json
{
  "success": true,
  "message": "Phone verified successfully.",
  "user": {
    "id": "<ObjectId>",
    "name": null,
    "email": null,
    "phone": "9800000000",
    "role": "passenger",
    "roles": ["passenger"],
    "phoneVerified": true,
    "profilePicture": null
  },
  "accessToken": "<jwt>",
  "activeRole": "passenger",
  "passwordSetupRequired": true
}
```

`passwordSetupRequired` is `true` when the account has no password (new minimal account). Clients should prompt for password setup when this flag is `true`.

The refresh token is delivered as an `httpOnly; SameSite=Lax` cookie named `refreshToken`. It does not appear in the response body.

## Legacy role repair

Accounts created before the multi-role system (`roles: []` with `role: 'passenger'`) are silently repaired using `$addToSet` before the token is issued. The repair:

- adds `passenger` to `roles[]`
- does NOT change `roleActivatedAt.passenger`
- does NOT change the historical `role` field
- reloads session state before passing to `generateTokenPair`

This ensures the access-token `roles[]` claim matches the physical database state required by DB-backed authorization middleware.

## Login service interaction

The general login service (`src/modules/auth/login/login.service.js`) has a `PASSWORD_NOT_SET` guard inserted after `verifyAccountStatus()` and before `bcrypt.compare()`. If a passwordless passenger attempts password login, they receive:

```json
{
  "success": false,
  "message": "This account does not have a password. Please continue with phone verification.",
  "errorCode": "PASSWORD_NOT_SET"
}
```

Failed-login attempt counters are NOT incremented for this error.

## Rate limiting

| Route | Limiter |
|---|---|
| `/sendOTP` | `otpRateLimiter` (phone-presence check + IP-keyed send limiter) |
| `/verifyOTP` | `otpVerifyLimiter` (phone-keyed: 10 verify attempts per phone per 10 minutes) |

OTP per-phone cooldown (60 s) and hard block (3 sends, 10-minute lock) are enforced atomically inside `createAndSendOTP`. `otpSendLimiter` is not stacked on `/sendOTP` — the existing atomic controls are sufficient.
