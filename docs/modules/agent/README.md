# Agent self-service modules

[Back to module documentation](../README.md)

Agent self-service modules cover routes used by signed-in agents after authentication. These routes are mounted by `routes/indexRoute.js` at `/api/agent` and registered in `routes/agentRoute/agentRoute.js`.

Do not assume these contracts match agent authentication or admin-agent routes. The route middleware and defensive handler checks are verified separately.

## Current domains

| Domain | Status | Document |
|---|---|---|
| Dashboard | Modularized under `src/modules/agent/dashboard` | [Dashboard](dashboard.md) |
| Profile | Modularized under `src/modules/agent/profile` | [Profile](profile.md) |
| Application workflow | Legacy controller-backed flow | Not documented in this pass |
| Document proxy | Legacy controller-backed flow | Not documented in this pass |

## Endpoint ownership

| Method | Full path | Middleware in order | Owning module |
|---|---|---|---|
| GET | `/api/agent/profile` | `auth`, `verifyRoleFromDB`, `agentMiddleware`, `requireApprovedAgent` | `agentProfile.getProfile` |
| GET | `/api/agent/dashboard` | `auth`, `verifyRoleFromDB`, `agentMiddleware`, `requireApprovedAgent` | `agentDashboard.getDashboard` |

## Verification references

- Base branch: `dev`
- Verified source: `refactor/agent-profile` working tree
- Mount: `routes/indexRoute.js`
- Routes: `routes/agentRoute/agentRoute.js`
- Entry points:
  - `src/modules/agent/profile/index.js`
  - `src/modules/agent/dashboard/index.js`
- Implementation:
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
  - `npm run test:agent-profile`
  - `npm run test:agent-dashboard`
