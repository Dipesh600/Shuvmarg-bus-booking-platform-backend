# Agent admin modules

[Back to module documentation](../README.md)

Agent admin modules cover admin-facing agent management and reporting routes mounted through `routes/indexRoute.js` under `/api/admin`.

## Current domains

| Domain | Status | Document |
|---|---|---|
| Dashboard | Modularized under `src/modules/agent/admin/dashboard` | [Dashboard](dashboard.md) |

Other admin-agent endpoints still use `controllers/adminController/adminAgentController/adminAgentController.js` unless their route points to another module.

## Endpoint table

| Method | Full path | Middleware in order | Owning module |
|---|---|---|---|
| GET | `/api/admin/agentDashboard` | `adminMiddleware` | `agentDashboard.getAgentDashboard` |

## Verification references

- Base branch: `dev`
- Verified source: `refactor/agent-admin-dashboard` working tree
- Mount: `routes/indexRoute.js`
- Routes: `routes/adminRoutes/adminRoutes.js`
- Entry point: `src/modules/agent/admin/dashboard/index.js`
- Implementation:
  - `src/modules/agent/admin/dashboard/agent-dashboard.controller.js`
  - `src/modules/agent/admin/dashboard/agent-dashboard.service.js`
  - `src/modules/agent/admin/dashboard/agent-dashboard.repository.js`
  - `src/modules/agent/admin/dashboard/agent-dashboard.policy.js`
- Middleware inspected:
  - `middleware/adminMiddleware.js`
- Models/utilities inspected:
  - `models/agentModel.js`
- Characterization tests inspected:
  - `tests/characterization/agent-admin-dashboard.test.js`
- Unit tests inspected:
  - `tests/unit/agent/admin/agent-dashboard-policy.test.js`
- Validation command: `npm run test:agent-admin-dashboard`
