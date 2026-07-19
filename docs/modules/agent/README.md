# Agent self-service modules

[Back to module documentation](../README.md)

Agent self-service modules cover routes used by signed-in agents after authentication. These routes are mounted by `routes/indexRoute.js` at `/api/agent` and registered in `routes/agentRoute/agentRoute.js`.

Do not assume these contracts match agent authentication or admin-agent routes. The route middleware and defensive handler checks are verified separately.

## Current domains

| Domain | Status | Document |
|---|---|---|
| Dashboard | Modularized under `src/modules/agent/dashboard` | [Dashboard](dashboard.md) |
| Profile and application workflow | Legacy controller-backed flow | Not documented in this pass |
| Document proxy | Legacy controller-backed flow | Not documented in this pass |

## Endpoint ownership

| Method | Full path | Middleware in order | Owning module |
|---|---|---|---|
| GET | `/api/agent/dashboard` | `auth`, `verifyRoleFromDB`, `agentMiddleware`, `requireApprovedAgent` | `agentDashboard.getDashboard` |

## Verification references

- Base branch: `dev`
- Verified source: `refactor/agent-dashboard` working tree
- Mount: `routes/indexRoute.js`
- Routes: `routes/agentRoute/agentRoute.js`
- Entry point: `src/modules/agent/dashboard/index.js`
- Implementation:
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
  - `tests/characterization/agent-dashboard.test.js`
  - `tests/unit/agent/dashboard/agent-dashboard-controller.test.js`
  - `tests/unit/agent/dashboard/agent-dashboard-service.test.js`
  - `tests/unit/agent/dashboard/agent-dashboard-repository.test.js`
  - `tests/unit/agent/dashboard/agent-dashboard-mapper.test.js`
- Validation command: `npm run test:agent-dashboard`
