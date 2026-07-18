# Agent registration

[Back to agent authentication](README.md)

Related: [general registration](../auth/registration.md).

## Purpose

Agent registration lets a phone number start or complete agent self-registration. It supports both new User creation and adding the agent role to an existing User.

## Who uses it

Unauthenticated agent portal clients under `/api/auth/agent`.

## Responsibilities

- Send and resend `AGENT_REGISTRATION` OTPs.
- Verify agent registration OTPs and issue an agent verification token.
- Create `PartnerLead` records after OTP verification.
- Complete new-user registration or existing-user upgrade.
- Ensure an Agent profile exists in `DRAFT`.
- Issue an agent session after successful registration.

## What this module does not do

- It does not submit or approve Agent KYC/application details.
- It does not log in existing agents; see [agent login](login.md).
- It does not reset agent passwords; see [agent password reset](password-reset.md).

## Public endpoints

| Method | Full path | Middleware in order | Handler |
|---|---|---|---|
| POST | `/api/auth/agent/sendOTP` | `otpRateLimiter` | `agentRegistration.sendOTP` |
| POST | `/api/auth/agent/verifyOTP` | `otpVerifyLimiter` | `agentRegistration.verifyOTP` |
| POST | `/api/auth/agent/register` | None at route level | `agentRegistration.register` |
| POST | `/api/auth/agent/resendOTP` | `otpRateLimiter` | `agentRegistration.resendOTP` |

## Request and response walkthrough

`sendOTP` normalizes `phone`, requires Nepal mobile format `/^(97|98)\d{8}$/`, checks `checkPhoneForRole(phone, "agent")`, and returns a neutral `200` for fully registered agents and banned/inactive users without sending OTP. Existing users without agent role and orphaned agent-role users without Agent docs can still receive OTP. OTP purpose is `AGENT_REGISTRATION`.

`verifyOTP` normalizes phone, strips non-digits from OTP, requires six digits, verifies `AGENT_REGISTRATION`, re-checks agent role to avoid races, writes an `otp_verified` agent `PartnerLead` best-effort, and returns `verificationToken`, `exists`, `userName`, and `existingRoles`.

`register` validates phone, name, trimmed name length, verification token, consumed OTP, 30-minute OTP recency, existing agent state, password rules, and duplicate email for new users. Existing users get `$addToSet: { roles: "agent" }`, password replacement, and `roleActivatedAt.agent`. New users are created with role/roles agent, active status, `phoneVerified: true`, and `isVerified: false`. Agent profile is upserted with `applicationStatus: "DRAFT"`; if `agentId` is absent, the document is saved to trigger ID generation. Success returns `201`, an access token, activeRole `agent`, and a refresh-token cookie only.

`resendOTP` rejects existing agent roles with `409`, otherwise sends `AGENT_REGISTRATION` and returns `expiresIn`.

## Flow walkthrough

1. Normalize phone.
2. Send/verify OTP with purpose `AGENT_REGISTRATION`.
3. Verification token binds phone and purpose.
4. Register requires a consumed recent OTP record.
5. Existing users are upgraded; new users are created.
6. Agent profile upsert happens before token generation.
7. Lead conversion is fire-and-forget.

## Authentication or ownership proof

Registration completion relies on a consumed `AGENT_REGISTRATION` OTP plus a matching verification token.

## Data read and changed

| Model/document | Reads | Changes |
|---|---|---|
| `User` | Role-aware phone lookup, email uniqueness, consumed OTP owner | Existing-user upgrade adds `agent` role and replaces password; new-user path creates active User with agent role. |
| `Agent` | Existing Agent profile by user | Upserts `applicationStatus: "DRAFT"` profile and saves if `agentId` is missing. |
| `OTP` | Consumed `AGENT_REGISTRATION` OTP and age | Created/updated by send/resend; consumed by verify. |
| `PartnerLead` | `otp_verified` agent lead | Upsert after verification; convert after registration. |
| `RefreshToken` | None directly | Created by token generation after registration. |

## Dependencies

- `phoneGuard` normalizes and performs role-aware phone checks.
- `otpHelper` handles OTP send/verify.
- `verificationToken` issues and validates registration proof.
- `passwordValidator`, `bcryptjs`, and `tokenService` validate, hash, and issue sessions.

## Security-sensitive behavior

- Send endpoint is enumeration-resistant for already-registered and suspended states.
- Banned/inactive users receive neutral send response, not an explicit error.
- Register requires verification token and a recent consumed OTP.
- Upgrade path replaces the existing password.
- Refresh token is cookie-only.

## Tests

Characterization tests cover send, verify, new-user registration, upgrade/orphan repair, duplicate/generic errors, and resend. Unit tests cover controller, service order, repository queries, policy, and error mappings.

## Known limitations or inconsistencies

`sendOTP` returns neutral success for banned/inactive users without sending OTP, while `resendOTP` rejects existing agent roles with `409`. Orphaned agent-role users without an Agent document are intentionally allowed through repair behavior.

## Safe extension guidance

Before changing this module, verify OTP purpose, Nepal phone validation, verification-token binding, upgrade password replacement, Agent DRAFT profile creation, agentId save fallback, lead non-fatal behavior, and token/cookie output.

## Verification references

- Base branch: `dev`
- Verified commit: `17175676a11842f66fb28c96e4bf54bb37a0d262`
- Mount: `routes/indexRoute.js`
- Routes: `routes/authRoutes/agentAuthRoutes.js`
- Entry point: `src/modules/agent/auth/registration/index.js`
- Implementation:
  - `src/modules/agent/auth/registration/agent-registration.controller.js`
  - `src/modules/agent/auth/registration/agent-registration.service.js`
  - `src/modules/agent/auth/registration/agent-registration-otp.service.js`
  - `src/modules/agent/auth/registration/agent-registration-completion.service.js`
  - `src/modules/agent/auth/registration/agent-registration.repository.js`
  - `src/modules/agent/auth/registration/agent-registration-lead.repository.js`
  - `src/modules/agent/auth/registration/agent-registration.policy.js`
  - `src/modules/agent/auth/registration/agent-registration.errors.js`
- Middleware:
  - `middleware/otpRateLimiter.js`
- Models/utilities inspected:
  - `models/userModel.js`
  - `models/agentModel.js`
  - `models/otpModel.js`
  - `models/PartnerLead.js`
  - `models/refreshTokenModel.js`
  - `utils/phoneGuard.js`
  - `utils/otpHelper.js`
  - `utils/passwordValidator.js`
  - `utils/verificationToken.js`
  - `utils/tokenService.js`
- Characterization tests inspected:
  - `tests/characterization/agent-registration-send-otp.test.js`
  - `tests/characterization/agent-registration-verify-otp.test.js`
  - `tests/characterization/agent-registration-new-user.test.js`
  - `tests/characterization/agent-registration-upgrade.test.js`
  - `tests/characterization/agent-registration-errors.test.js`
  - `tests/characterization/agent-registration-resend-otp.test.js`
- Unit tests inspected:
  - `tests/unit/agent/agent-registration-controller.test.js`
  - `tests/unit/agent/agent-registration-service.test.js`
  - `tests/unit/agent/agent-registration-repository.test.js`
  - `tests/unit/agent/agent-registration-policy.test.js`
  - `tests/unit/agent/agent-registration-errors.test.js`
- Validation command: `npm run test:agent-registration`
