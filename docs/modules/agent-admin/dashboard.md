# Agent admin dashboard

[Back to agent admin modules](README.md)

## Purpose

The agent admin dashboard module returns read-only aggregate counts for agent applications in the admin panel. It exists to move `GET /api/admin/agentDashboard` out of the legacy admin-agent controller without changing the statistics or response shape.

## Who uses it

Admin clients calling `/api/admin/agentDashboard`. The route is protected by `adminMiddleware`.

## Responsibilities

- Count all Agent documents.
- Count registered agents as `APPROVED`, `PENDING`, `MORE_INFO`, and `SUSPENDED`.
- Count individual application statuses and agent types.
- Format the legacy dashboard response.

## What this module does not do

- It does not mutate `Agent` or `User` records.
- It does not review KYC documents; see [Agent KYC review](../kyc/agent-review.md).
- It does not list individual agents or convert users into agents.

## Public endpoints

| Method | Full path | Middleware in order | Handler |
|---|---|---|---|
| GET | `/api/admin/agentDashboard` | `adminMiddleware` | `agentDashboard.getAgentDashboard` |

## Request and response walkthrough

The endpoint does not read request body fields. A valid admin access token is required by `adminMiddleware`.

Success returns `200` with `success: true` and `data`. `data.totalAgents` is the registered count, not the all-time count. `data.allTimeTotal` is the count of every `Agent` document. `data.approvedAgents` remains a formatted string such as `2 (40% of registered)`. When the registered count is zero, the percentage value is `0`.

Unexpected count failures log with `getAgentDashboard error:` and return `500` with `Failed to fetch agent dashboard stats` plus `error: error.message`.

## Flow walkthrough

1. The route runs `adminMiddleware`.
2. The controller calls the dashboard service.
3. The repository runs ten `Agent.countDocuments` queries.
4. The policy maps counts into the legacy response shape.
5. The controller sends the response through `respond`.

## Authentication or ownership proof

The proof is an admin access token accepted by `adminMiddleware`. There is no user ownership check because this is an admin aggregate endpoint.

## Data read and changed

| Model/document | Reads | Changes |
|---|---|---|
| `Agent` | All documents; `applicationStatus` counts for `APPROVED`, `PENDING`, `REJECTED`, `MORE_INFO`, `SUSPENDED`, `DRAFT`; `agentType` counts for `DEFAULT` and `OPERATOR_LINKED` | None |

## Dependencies

- `adminMiddleware` enforces admin authentication and role checks.
- `agent-dashboard.repository` is the only module file that imports `models/agentModel.js`.
- `agent-dashboard.policy` formats percentages and response fields.
- `asyncHandler` and `respond` provide the shared HTTP adapter pattern.

## Security-sensitive behavior

- The route remains protected by `adminMiddleware`.
- The registered count intentionally excludes `DRAFT` and `REJECTED`.
- `approvedAgents` is a string, not a numeric field.
- The percentage uses `.toFixed(0)` and keeps `0` when there are no registered agents.
- The endpoint is read-only.

## Tests

`tests/characterization/agent-admin-dashboard.test.js` covers route protection, zero-agent response, all status/type counts, registered versus all-time totals, approved percentage formatting, and the exact 500 response. `tests/unit/agent/admin/agent-dashboard-policy.test.js` covers pure percentage and response mapping behavior.

## Known limitations or inconsistencies

`totalAgents` means registered agents while `allTimeTotal` means every Agent document. This naming is legacy behavior and is preserved by the module.

## Safe extension guidance

Before changing this module, verify route middleware, all ten count filters, the registered-agent definition, the formatted `approvedAgents` field, the zero-count percentage behavior, and the generic 500 response.

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
