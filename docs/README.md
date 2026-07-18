# Backend module handbook

This handbook lives with the backend code. Production code remains the ultimate source of truth; these pages describe the current implementation verified from routes, modules, models, utilities, middleware, and tests.

Documentation changes should accompany behavior changes. A pull request that changes any documented endpoint, middleware chain, response contract, database side effect, security decision, or test location must update the corresponding module document in the same pull request.

The handbook currently covers authentication modules. Future domains can be added under [docs/modules](modules/README.md) when needed. Historical refactor documents under `docs/refactor/` may describe older states, including deleted controllers, and should not be treated as current implementation documentation.

## Contents

| Area | Description |
|---|---|
| [General authentication modules](modules/auth/README.md) | Passenger/general authentication flows mounted under `/api`. |
| [Agent authentication modules](modules/agent-auth/README.md) | Agent-specific authentication flows mounted under `/api/auth/agent`. |

## Documentation maintenance rule

A pull request that changes any documented endpoint, middleware chain, response contract, database side effect, security decision, or test location must update the corresponding module document in the same pull request.
