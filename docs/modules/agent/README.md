# Agent self-service modules

[Back to module documentation](../README.md)

Agent self-service modules cover routes used by signed-in agents after authentication. These routes are mounted by `routes/indexRoute.js` at `/api/agent` and registered in `routes/agentRoute/agentRoute.js`.

Do not assume these contracts match agent authentication or admin-agent routes. The route middleware and defensive handler checks are verified separately.

## Current domains

| Domain | Status | Document |
|---|---|---|
| Dashboard | Modularized under `src/modules/agent/dashboard` | [Dashboard](dashboard.md) |
| Profile | Modularized under `src/modules/agent/profile` | [Profile](profile.md) |
| Application status | Modularized under `src/modules/agent/application-status` | [Application status](application-status.md) |
| Application save, document upload and submit | Legacy controller-backed flow | Not documented in this pass |
| Document proxy | Legacy controller-backed flow | Not documented in this pass |

## Endpoint ownership

| Method | Full path | Middleware in order | Owning module |
|---|---|---|---|
| GET | `/api/agent/application/status` | `auth`, `verifyRoleFromDB`, `agentMiddleware` | `agentApplicationStatus.getApplicationStatus` |
| GET | `/api/agent/profile` | `auth`, `verifyRoleFromDB`, `agentMiddleware`, `requireApprovedAgent` | `agentProfile.getProfile` |
| GET | `/api/agent/dashboard` | `auth`, `verifyRoleFromDB`, `agentMiddleware`, `requireApprovedAgent` | `agentDashboard.getDashboard` |

## Verification references

- Base branch: `dev`
- Verified source: `refactor/agent-application-status` working tree
- Mount: `routes/indexRoute.js`
- Routes: `routes/agentRoute/agentRoute.js`
- Entry points:
  - `src/modules/agent/profile/index.js`
  - `src/modules/agent/dashboard/index.js`
  - `src/modules/agent/application-status/index.js`
- Implementation:
  - `src/modules/agent/application-status/agent-application-status.controller.js`
  - `src/modules/agent/application-status/agent-application-status.service.js`
  - `src/modules/agent/application-status/agent-application-status.repository.js`
  - `src/modules/agent/application-status/agent-application-status.mapper.js`
  - `src/modules/agent/application-status/document-url.service.js`
  - `src/modules/agent/application-status/reapply-policy.js`
  - `src/modules/agent/profile/agent-profile.controller.js`
  - `src/modules/agent/profile/agent-profile.service.js`
  - `src/modules/agent/profile/agent-profile.repository.js`
  - `src/modules/agent/profile/agent-profile.mapper.js`
  - `src/modules/agent/dashboard/agent-dashboard.controller.js`
  - `src/modules/agent/dashboard/agent-dashboard.service.js`
  - `src/modules/agent/dashboard/agent-dashboard.repository.js`
  - `src/modules/agent/dashboard/agent-dashboard.mapper.js`
- Middleware inspected:
  - `middleware/authMiddleware.js`
  - `middleware/verifyRoleFromDB.js`
  - `middleware/checkRole.js`
  - `middleware/requireApprovedAgent.js`
- Models/utilities inspected:
  - `models/agentModel.js`
  - `models/userModel.js`
  - `utils/logger.js`
- Tests:
  - `tests/characterization/agent-application-status.test.js`
  - `tests/unit/agent/application-status/agent-application-status-controller.test.js`
  - `tests/unit/agent/application-status/agent-application-status-service.test.js`
  - `tests/unit/agent/application-status/agent-application-status-repository.test.js`
  - `tests/unit/agent/application-status/agent-application-status-mapper.test.js`
  - `tests/unit/agent/application-status/document-url-service.test.js`
  - `tests/unit/agent/application-status/reapply-policy.test.js`
  - `tests/characterization/agent-profile.test.js`
  - `tests/unit/agent/profile/agent-profile-controller.test.js`
  - `tests/unit/agent/profile/agent-profile-service.test.js`
  - `tests/unit/agent/profile/agent-profile-repository.test.js`
  - `tests/unit/agent/profile/agent-profile-mapper.test.js`
  - `tests/characterization/agent-dashboard.test.js`
  - `tests/unit/agent/dashboard/agent-dashboard-controller.test.js`
  - `tests/unit/agent/dashboard/agent-dashboard-service.test.js`
  - `tests/unit/agent/dashboard/agent-dashboard-repository.test.js`
  - `tests/unit/agent/dashboard/agent-dashboard-mapper.test.js`
- Validation commands:
  - `npm run test:agent-application-status`
  - `npm run test:agent-profile`
  - `npm run test:agent-dashboard`
