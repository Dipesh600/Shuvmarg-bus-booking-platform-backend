# KYC modules

[Back to module documentation](../README.md)

KYC modules document admin review flows for submitted identity or business verification records. These pages describe the current routed implementation and the tests that protect each review contract.

## Current domains

| Domain | Status | Document |
|---|---|---|
| Agent review | Modularized under `src/modules/kyc/agent-review` | [Agent review](agent-review.md) |

Bus-owner KYC review remains outside this module set in this documentation pass.

## Bus-owner document security gate

Bus-owner KYC files are validated and streamed to a private ClamAV `clamd`
service before any S3 upload begins. Production is fail closed:

- `KYC_MALWARE_SCAN_MODE=required` is mandatory in production.
- `CLAMD_HOST`, `CLAMD_PORT` and `CLAMD_TIMEOUT_MS` configure the private daemon.
- infected files return HTTP 422 and are never stored;
- unavailable or invalid scanners return HTTP 503 and no files are stored;
- only submissions recorded with a clean scan can generate reviewer download URLs;
- the generic document proxy rejects `owners/{id}/kyc/*` keys so it cannot bypass
  the record-bound scan and authorization gate.

The clamd TCP port has no built-in authentication or encryption and must never be
publicly exposed. The staging Compose topology keeps it on the private application
network and persists its signature database. Allocate at least 3 GiB RAM (4 GiB
preferred) for the scanner host and monitor signature updates and scan failures.

For local development only, `KYC_MALWARE_SCAN_MODE=disabled` skips scanning and
marks documents `skipped_non_production`; production rejects this mode.

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
