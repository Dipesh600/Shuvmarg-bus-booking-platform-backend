# Agent Application Draft Module

This module handles the saving of an agent's KYC application draft. The application workflow allows an agent to save partial data across multiple steps before final submission.

## Module walkthrough

*   **Controller (`agent-application-draft.controller.js`)**: Handles HTTP request parsing, response formatting, and generic error handling (500 responses).
*   **Service (`agent-application-draft.service.js`)**: Coordinates the core logic: retrieving or creating the agent, validating the application status, applying field updates, and saving to the repository.
*   **Repository (`agent-application-draft.repository.js`)**: Encapsulates all interactions with the `Agent` database model (`findOne` and `save`, as well as creating a new instance).
*   **Policy (`agent-application-draft.policy.js`)**: Dictates business rules, specifically that drafts can only be edited when the application status is `DRAFT` or `MORE_INFO`.
*   **Updater (`draft-updater.js`)**: Safely applies payload fields to the agent document, ensuring only supported fields are updated, explicit nulls are respected, and unknown fields are ignored. It also handles the conversion of `whatsappConsent` to a boolean.

## API Endpoint

`POST /api/agent/application/save`

### Middleware Chain

1.  `auth`: Verifies the authentication token.
2.  `verifyRoleFromDB`: Ensures the user's role matches the database.
3.  `agentMiddleware`: Enforces that the user has the 'agent' role.
4.  `agentApplicationDraft.saveApplicationDraft`: The core controller handling the request.

*(Note: `requireApprovedAgent` is deliberately excluded because drafting occurs prior to approval.)*

### Supported Fields

The draft updater strictly processes the following fields (if present in the payload):

**Location**
*   `district`
*   `municipality`
*   `placeName`

**Business**
*   `businessName`
*   `shopAddress`
*   `operationType`
*   `claimedMonthlyVolume`
*   `currentOperators`
*   `referralSource`

**Identification**
*   `citizenshipNumber`
*   `nationalIdNumber`
*   `panNumber`

**Consent**
*   `whatsappConsent` (automatically coerced to boolean)

**Settlement**
*   `settlementMethod`
*   `bankName`
*   `bankAccountNumber`
*   `bankAccountName`
*   `esewaNumber`
*   `khaltiNumber`

### Update Semantics

*   **Explicit Updates**: A field is only updated if it is not `undefined` in the request payload.
*   **Nulls Respected**: Sending `null` for a supported field will overwrite the database value with `null`.
*   **Omitted Fields**: Fields omitted from the payload remain unchanged in the database.
*   **Unknown Fields**: Any fields in the payload not explicitly supported are completely ignored.

## Editable Statuses

The application can only be modified if the `applicationStatus` is:
*   `DRAFT` (initial state)
*   `MORE_INFO` (admin requested revisions)

If the application is in any other status (e.g., `PENDING`, `APPROVED`, `REJECTED`), a 400 Bad Request error is returned.

## Database Behavior

1.  When saving, the system queries the `Agent` collection by the authenticated `userId` (`Agent.findOne({ user: userId })`).
2.  If an agent record does not exist for the user, a new record is initialized.
3.  The agent document is updated and saved exactly once.

## Responses

### Success
```json
{
  "success": true,
  "message": "Application draft saved.",
  "data": {
    "agentId": "AG123456",
    "applicationStatus": "DRAFT"
  }
}
```

### Errors

**Unauthorized (Missing/Invalid Token)**
```json
{
  "success": false,
  "message": "Unauthorized."
}
```

**Non-Editable Status**
```json
{
  "success": false,
  "message": "Application cannot be edited in \"PENDING\" status."
}
```

**Internal Error**
```json
{
  "success": false,
  "message": "Internal Server Error"
}
```
