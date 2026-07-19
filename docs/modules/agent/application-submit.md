# Agent Application Submit Module

[Back to module documentation](README.md)

This module handles the final submission of the KYC application by an agent to the admin team for review.

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
- `tests/characterization/agent-application-submit-success.test.js`
- `tests/unit/agent/application-submit/application-completeness.validator.test.js`
- `tests/unit/agent/application-submit/reapply-window.policy.test.js`
- `tests/unit/agent/application-submit/agent-application-submit.controller.test.js`
- `tests/unit/agent/application-submit/agent-application-submit.service.test.js`
- `tests/unit/agent/application-submit/agent-application-submit.repository.test.js`
- `tests/unit/agent/application-submit/agent-application-submit.policy.test.js`
