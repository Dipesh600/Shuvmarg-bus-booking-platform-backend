# Agent admin modules

[Back to module documentation](../README.md)

Agent admin modules cover admin-facing agent management and reporting routes mounted through `routes/indexRoute.js` under `/api/admin`.

## Current domains

| Domain | Status | Document |
|---|---|---|
| Dashboard | Modularized under `src/modules/agent/admin/dashboard` | [Dashboard](dashboard.md) |
| Directory | Modularized under `src/modules/agent/admin/directory` | [Directory](directory.md) |
| Conversion | Modularized under `src/modules/agent/admin/conversion` | [Conversion](conversion.md) |
| Setup | Modularized under `src/modules/agent/admin/setup` | [Setup](setup.md) |

The legacy admin-agent controller has been removed. Current admin-agent routes point to dedicated modules.

## Endpoint table

| Method | Full path | Middleware in order | Owning module |
|---|---|---|---|
| POST | `/api/admin/getAgentDetails` | `adminMiddleware` | `agentDirectory.getAgentsById` |
| GET | `/api/admin/getAllAgents` | `adminMiddleware` | `agentDirectory.getAllAgents` |
| GET | `/api/admin/agentDashboard` | `adminMiddleware` | `agentDashboard.getAgentDashboard` |
| POST | `/api/admin/makeUserAgent` | `adminMiddleware` | `agentConversion.makeUserAgent` |
| PATCH | `/api/admin/finalizeAgentSetup` | `adminMiddleware` | `agentSetup.finalizeAgentSetup` |

## Verification references

- Base branch: `dev`
- Verified source: `refactor/agent-admin-setup` working tree
- Mount: `routes/indexRoute.js`
- Routes: `routes/adminRoutes/adminRoutes.js`
- Entry points:
  - `src/modules/agent/admin/setup/index.js`
  - `src/modules/agent/admin/conversion/index.js`
  - `src/modules/agent/admin/directory/index.js`
  - `src/modules/agent/admin/dashboard/index.js`
- Implementation:
  - `src/modules/agent/admin/setup/agent-setup.controller.js`
  - `src/modules/agent/admin/setup/agent-setup.service.js`
  - `src/modules/agent/admin/setup/agent-setup.repository.js`
  - `src/modules/agent/admin/setup/agent-setup.policy.js`
  - `src/modules/agent/admin/setup/agent-setup-fields.js`
  - `src/modules/agent/admin/setup/agent-setup-notification.service.js`
  - `src/modules/agent/admin/conversion/agent-conversion.controller.js`
  - `src/modules/agent/admin/conversion/agent-conversion.service.js`
  - `src/modules/agent/admin/conversion/agent-conversion.repository.js`
  - `src/modules/agent/admin/conversion/agent-conversion.policy.js`
  - `src/modules/agent/admin/directory/agent-directory.controller.js`
  - `src/modules/agent/admin/directory/agent-directory.service.js`
  - `src/modules/agent/admin/directory/agent-directory.repository.js`
  - `src/modules/agent/admin/directory/agent-directory.mapper.js`
  - `src/modules/agent/admin/directory/agent-document-preview.service.js`
  - `src/modules/agent/admin/dashboard/agent-dashboard.controller.js`
  - `src/modules/agent/admin/dashboard/agent-dashboard.service.js`
  - `src/modules/agent/admin/dashboard/agent-dashboard.repository.js`
  - `src/modules/agent/admin/dashboard/agent-dashboard.policy.js`
- Middleware inspected:
  - `middleware/adminMiddleware.js`
- Models/utilities inspected:
  - `models/agentModel.js`
  - `models/userModel.js`
  - `models/operatorBrandModel.js`
  - `services/s3Service.js`
  - `handlers/sparro-otp.js`
  - `controllers/notificationController/notification_manager.js`
- Characterization tests inspected:
  - `tests/characterization/agent-admin-setup.test.js`
  - `tests/characterization/agent-admin-conversion.test.js`
  - `tests/characterization/agent-admin-directory.test.js`
  - `tests/characterization/agent-admin-dashboard.test.js`
- Unit tests inspected:
  - `tests/unit/agent/admin/agent-setup-policy.test.js`
  - `tests/unit/agent/admin/agent-setup-service.test.js`
  - `tests/unit/agent/admin/agent-setup-notification-service.test.js`
  - `tests/unit/agent/admin/agent-conversion-policy.test.js`
  - `tests/unit/agent/admin/agent-conversion-service.test.js`
  - `tests/unit/agent/admin/agent-directory-mapper.test.js`
  - `tests/unit/agent/admin/agent-document-preview-service.test.js`
  - `tests/unit/agent/admin/agent-dashboard-policy.test.js`
- Validation commands:
  - `npm run test:agent-admin-setup`
  - `npm run test:agent-admin-conversion`
  - `npm run test:agent-admin-directory`
  - `npm run test:agent-admin-dashboard`
