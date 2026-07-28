# KYC modules

[Back to module documentation](../README.md)

KYC modules document admin review flows for submitted identity or business verification records. These pages describe the current routed implementation and the tests that protect each review contract.

## Current domains

| Domain | Status | Document |
|---|---|---|
| Agent review | Modularized under `src/modules/kyc/agent-review` | [Agent review](agent-review.md) |

Bus-owner KYC review remains outside this module set in this documentation pass.

## Endpoint table

| Method | Full path | Middleware in order | Owning module |
|---|---|---|---|
| PATCH | `/api/admin/agentKycStatus` | `adminMiddleware` | `agentKycReview.updateAgentKyc` |

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
