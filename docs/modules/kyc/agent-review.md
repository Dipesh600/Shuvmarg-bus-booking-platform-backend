# Agent KYC review

[Back to KYC modules](README.md)

## Purpose

The agent KYC review module lets an authenticated admin review an agent application, verify or reject individual uploaded documents, change the agent application status, synchronize selected `User` fields, and notify the agent when an application-level decision is made.

## Who uses it

Admin clients calling `/api/admin/agentKycStatus`. The route is protected by `adminMiddleware`.

## Responsibilities

- Resolve the target agent from the submitted `id`.
- Apply per-document verification and rejection fields.
- Apply application status decisions and admin configuration fields.
- Save the agent before sending decision notifications.
- Keep email, SMS, local notification, and push failures non-fatal.

## What this module does not do

- It does not review bus-owner KYC.
- It does not validate new status-transition rules.
- It does not change agent registration or agent-side document upload flows.
- It does not send notifications for document-only updates.

## Public endpoints

| Method | Full path | Middleware in order | Handler |
|---|---|---|---|
| PATCH | `/api/admin/agentKycStatus` | `adminMiddleware` | `agentKycReview.updateAgentKyc` |

## Request and response walkthrough

The request body may include `id`, `documentVerifications`, `applicationStatus`, `rejectionReason`, `isPermanentlyRejected`, `moreInfoRequest`, `commissionRate`, `minSettlementThreshold`, and `adminNotes`.

Agent lookup preserves the legacy order: first `Agent.findOne({ user: id })` for a valid `ObjectId`, then `Agent.findById(id)`, then `Agent.findOne({ agentId: id })`. A missing agent returns `404` with `Agent not found!`.

For each matching document review, a boolean `verified` value updates `doc.verified`. Verified documents receive `verifiedBy` from the admin ID, `verifiedAt` as the current date, and `rejectionReason: null`. String rejection reasons are copied onto the document.

Success always returns `200` with `Agent application updated successfully!`. Unexpected controller errors log with `updateAgentKyc error:` and return `500` with `Internal Server Error!`.

## Flow walkthrough

1. The controller reads the request body and `req.adminInfo?.id`.
2. The service resolves the agent using the legacy lookup order.
3. Document verification changes are applied before application-level status changes.
4. Application status changes update the `Agent` document and selected `User` fields.
5. Admin configuration fields are applied.
6. The agent is saved.
7. Notifications are sent only when `applicationStatus` is present.

## Authentication or ownership proof

`adminMiddleware` validates the admin access token and populates `req.adminInfo`. The admin ID is used as `verifiedBy`, `approvedBy`, or `suspendedBy` where the reviewed action sets those fields.

## Data read and changed

| Model/document | Reads | Changes |
|---|---|---|
| `Agent` | User ObjectId, Agent ObjectId, or `agentId`; current documents and application status | Document `verified`, `verifiedBy`, `verifiedAt`, `rejectionReason`; `applicationStatus`; `approvedAt`; `approvedBy`; `rejectionReason`; `isPermanentlyRejected`; `moreInfoRequest`; `moreInfoRequestedAt`; `suspendedAt`; `suspendedBy`; `suspensionReason`; `commissionRate`; `minSettlementThreshold`; `adminNotes` |
| `User` | Notification recipient `name`, `email`, and `phone` | `isVerified` and `status` for selected application status changes |
| `UserDeviceInfo` | Device tokens for push notifications | None |
| `LocalNotification` | Not read directly by the module | Created through `createLocalNotification` for decision notifications |

## Dependencies

- `adminMiddleware` protects the route and supplies admin identity.
- `agent-kyc-review.repository` owns `Agent`, `User`, and `UserDeviceInfo` model access.
- `emailManager` and `generateAgentStatusEmail` send status email.
- `sendOTP` sends the SMS text used by the legacy flow.
- `createLocalNotification` and `notificationManager` send local and push notifications.

## Security-sensitive behavior

- Lookup order matters because a valid Mongo ObjectId is first treated as a possible `User._id`, then as an `Agent._id`.
- Status decisions are saved before notification attempts.
- Document-only updates do not send email, SMS, local, or push notifications.
- Notification failures are logged and swallowed so the saved review result still succeeds.
- Reactivating a suspended agent through `APPROVED` clears suspension fields and sets the user active.

## Tests

`tests/characterization/agent-kyc-review.test.js` covers public route behavior for all supported identifier forms, missing agent response, document verification/rejection, admin configuration fields, and no notifications for document-only updates. `tests/characterization/agent-kyc-review-status.test.js` covers status decisions, suspended-agent reactivation, non-fatal notification failures, and the generic 500 response. `tests/unit/kyc/agent-kyc-review-service.test.js` covers service-level document review, rejection, suspension, and suspended-agent reactivation behavior.

## Known limitations or inconsistencies

The endpoint accepts application status values without adding transition validation in the module. Email helper failures are swallowed inside `emailManager`, so the service-level email warning path is only reached if the helper itself throws. These behaviors match the verified implementation and were not changed in this refactor.

## Safe extension guidance

Before changing this module, re-check route middleware, lookup order, document field updates, `User` synchronization, agent save ordering, notification copy and failure behavior, and the exact response bodies protected by the characterization test.

## Verification references

- Base branch: `dev`
- Verified source: `refactor/agent-kyc-review` working tree
- Mount: `routes/indexRoute.js`
- Routes: `routes/adminRoutes/adminRoutes.js`
- Entry point: `src/modules/kyc/agent-review/index.js`
- Implementation:
  - `src/modules/kyc/agent-review/agent-kyc-review.controller.js`
  - `src/modules/kyc/agent-review/agent-kyc-review.service.js`
  - `src/modules/kyc/agent-review/agent-kyc-review.repository.js`
  - `src/modules/kyc/agent-review/agent-kyc-review.policy.js`
- Middleware inspected:
  - `middleware/adminMiddleware.js`
- Models/utilities inspected:
  - `models/agentModel.js`
  - `models/userModel.js`
  - `models/userDeviceInfoModel.js`
  - `handlers/agentStatusEmailTemp.js`
  - `handlers/sparro-otp.js`
  - `emailManager/emailManager.js`
  - `controllers/notificationController/notification_manager.js`
- Characterization tests inspected:
  - `tests/characterization/agent-kyc-review.test.js`
  - `tests/characterization/agent-kyc-review-status.test.js`
- Unit tests inspected:
  - `tests/unit/kyc/agent-kyc-review-service.test.js`
- Validation command: `npm run test:agent-kyc-review`
