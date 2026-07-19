# Agent Application Submit Module

[Back to module documentation](README.md)

This module handles the final submission of the KYC application by an agent to the admin team for review.

## Architecture

The module follows the strict separation of concerns required for the refactor, dividing the process into controllers, services, repositories, validators, and policies.

### Entry Point
- `index.js`: Exposes the `submitApplication` controller method.

### Layers
- **Controller** (`agent-application-submit.controller.js`): Handles HTTP requests, extracts parameters, invokes the service layer, and maps responses/errors to HTTP status codes.
- **Service** (`agent-application-submit.service.js`): Orchestrates business logic, evaluating submission readiness based on current application status, reapply windows, and form completeness.
- **Validator** (`application-completeness.validator.js`): Validates that the agent has provided all required fields (location, business details, identification numbers, and mandatory documents) before submission is allowed.
- **Policy** (`agent-application-submit.policy.js`): Enforces the rule that applications can only be submitted if their status is `DRAFT` or `MORE_INFO`.
- **Policy** (`reapply-window.policy.js`): Handles the logic for the 24-hour waiting period after a rejection before an agent can re-submit, as well as permanent rejections.
- **Repository** (`agent-application-submit.repository.js`): Encapsulates Mongoose interactions for retrieving and updating the agent document.

## Endpoint

### `POST /api/agent/application/submit`
Submit the completed application for admin review.

**Access**: Agent role (accessible in `DRAFT` or `MORE_INFO` status)

#### Request Body
```json
{
  "termsAccepted": true
}
```

#### Success Response
**Code**: `200 OK`
```json
{
  "success": true,
  "message": "Application submitted successfully! We'll review it within 2–3 business days.",
  "data": {
    "agentId": "AGT-123456",
    "applicationStatus": "PENDING",
    "submittedAt": "2026-07-20T00:00:00.000Z"
  }
}
```

#### Error Responses
- `401 Unauthorized`: No valid token.
- `404 Not Found`: No agent record exists.
- `400 Bad Request`: `termsAccepted` is missing or false.
- `400 Bad Request`: Application is incomplete (returns an `errors` array).
- `400 Bad Request`: Status is not `DRAFT` or `MORE_INFO` (e.g., already `PENDING`).
- `403 Forbidden`: Application is permanently rejected (`PERMANENTLY_REJECTED` code).
- `429 Too Many Requests`: Application was recently rejected and the 24-hour wait period is active (`REAPPLY_TOO_SOON` code).

## Testing

Verified with perfectly matched characterization tests ensuring identical behavior to the legacy monolithic controller.

- `tests/characterization/agent-application-submit.test.js`
- `tests/unit/agent/application-submit/application-completeness.validator.test.js`
- `tests/unit/agent/application-submit/reapply-window.policy.test.js`
