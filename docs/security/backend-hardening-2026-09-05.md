# Backend security changes — 5 September 2026

These changes are being integrated through a feature branch into dev and have not been promoted to staging. One phone continues to identify one User. Its explicit roles array controls membership; profiles and operator assignments control what that person can do. An empty roles array represents revoked access and does not fall back to the legacy role field.

## Implemented controls

| Review item | Result |
| --- | --- |
| SEC-01 | The document proxy resolves registered agent documents and checks the verified actor and scan status before storage access. An administrator cannot fetch an arbitrary object key. |
| SEC-02 | Referral application requires an authenticated account and rejects another user's ID. |
| SEC-03 | Cancellation claims the booking, releases seats, applies clawback/credit and records the refund in one MongoDB transaction. Notifications follow commit. |
| SEC-04–05 | Password changes increment session/credential versions. Temporary password changes require matching current versions and use a conditional final write. |
| SEC-06–07 | Adding agent/owner access preserves an existing password and checks current account restrictions at the role write. Password establishment cannot overwrite another request's password. |
| SEC-08 | Parsed inputs reject Mongo operators, dotted keys and prototype keys. Multipart parsing also rejects unsafe field names. |
| SEC-09 | Credential resets, agent conversion, owner creation/resend and crew creation require ADMIN or SUPER_ADMIN. Completion logs record staff identity, action and status without request credentials. |
| SEC-10–11 | Wallet and split-payment confirmation require a correct PIN on the actual request. Mongo-backed counters permit at most five incorrect/in-flight comparisons per account in 15 minutes. |
| SEC-12 | qs is updated to 6.16.0 or newer. The dependency installation audit reports zero known vulnerabilities. |
| SEC-13 | File buffering requires authentication. Public/auth JSON endpoints reject multipart. The shared parser caps each file at 20 MiB, the request at 21 MiB, files at four, fields at 32, parts at 36, fields at 16 KiB and total parsing time at 30 seconds. |
| SEC-14 | Agent uploads are scanned before processing and again before storage. Production previews require recorded clean status. |
| SEC-15 | Forwarded client addresses are trusted only with explicit proxy configuration. The checked-in private staging proxy uses one trusted hop. |
| SEC-16 | Generic map writes/decoding require authorized administrators, share a request limit, cap geocoding at 25 calls and 15 seconds, and cache successful address lookups for ten minutes with bounded memory. |
| SEC-17 | Adding owner access preserves forced password recovery. |
| SEC-18 | Administrator agent conversion and owner agent invitations commit User and Agent together. Invitation SMS is sent after commit. |
| SEC-19 | Request logs omit queries. Central logger redacts credentials, bearer tokens and signed URL queries. Raw document keys are removed from proxy diagnostics. |
| SEC-20 | Completion atomically reserves a hash of each signed registration proof before any identity or referral mutation. Concurrent/replayed use is rejected. |
| SEC-21 | Global/search/seat, login/password and map limits use MongoDB counters outside tests. PIN counters always use MongoDB. Sensitive operations fail closed if their counter cannot be checked. |

## Client behavior to account for

- Superseded 8 September 2026: SM Money now requires a short-lived code bound to the exact server-priced purchase. Permanent wallet PIN endpoints are retired.
- A missing PIN returns `WALLET_PIN_REQUIRED`; a wrong PIN returns `WALLET_PIN_INCORRECT`. Account attempt limits return HTTP 429. No reusable PIN proof is issued; the existing owned hold claim prevents duplicate confirmation.
- A consumed registration proof returns HTTP 409 with `VERIFICATION_ALREADY_USED`. If completion fails after reservation, obtain a fresh OTP and proof. The proof is deliberately not released after a potentially partial write.
- Existing agent/owner accounts keep their original shared password when adding another role. Registration is not a password-reset endpoint.
- Old temporary password tokens without credential/session versions require signing in again. Password changes invalidate older access tokens immediately.
- In production, legacy agent documents without a clean scan record cannot be previewed. Scan or replace them before rollout. Previously issued storage URLs may remain usable until their original expiry.
- Multipart callers need a valid session before upload. Login and registration clients should send JSON. File handlers consume the existing in-memory file fields (`name`, `data`, `size`, `mimetype`); the shared parser does not expose filesystem move operations.

## Verification

Run the dedicated abuse regression set with `npm run test:security-hardening`. It uses isolated MongoDB instances, replica sets for transactions, and mocked external providers. It does not exercise production payments, SMS, storage or malware infrastructure.

The security cases cover:

- Twenty simultaneous cancellations and rollback at six failure points, followed by a successful retry.
- Concurrent role/profile creation, failed profile writes, account restriction changes and credential preservation.
- Twenty simultaneous attempts to consume each type of registration proof, with exactly one successful reservation.
- Cross-account document and referral denial, stale password tokens and shared rate counters.
- PIN guesses across concurrent requests, correct PIN success for wallet/split payment, frozen wallets and attempts to bypass the PIN.
- Multipart file/field counts, chunked aggregate overflow, slow uploads, unsafe fields and anonymous rejection.
- Scanner failures, production preview restrictions, geocoding budgets/cache and redacted logs.

The final combined run passed all 775 tests with zero failures, skips or cancellations. It also covers existing registration, authentication, cancellation, booking confirmation, document upload and administrator route contracts. The installed dependency audit reported zero vulnerabilities (qs 6.16.0, busboy 1.6.0).

The release integration clears all 11 file-size violations by extracting activation/profile persistence, schema fields and test fixtures without increasing the baseline. The file-size and whitespace checks pass. Registration completion now includes deleted identities in its lookup so a restricted account cannot be mistaken for a new signup; regression cases also assert that no duplicate identity is created. The full repository test suite is being rerun before the dev merge.

## Remaining release work

SEC-22 through SEC-25 remain open. Local tests are not production evidence.

1. Confirm production signing-key strength and separation, then exercise rotation and emergency session revocation in staging without exposing key values.
2. Verify MongoDB replica-set/Atlas transaction support before deploying cancellation and identity transactions. Confirm the service account can use transactions. Verify TTL indexes for `ApiRateLimit.resetTime` and `ConsumedRegistrationProof.expiresAt`; logical expiry does not depend on immediate TTL deletion.
3. Configure `TRUSTED_PROXY_CIDRS` or `TRUSTED_PROXY_HOPS` for the actual proxy chain. Prevent direct public access to the application port. Test two external clients and spoofed forwarding headers.
4. Verify the production malware scanner, quarantine older agent documents and test scanner failure. Confirm private bucket access, least-privilege IAM and signed URL behavior.
5. Record database/firewall permissions, encryption, monitoring and a successful timed backup restore. Verify account-administration logs reach retained, access-controlled storage.
6. Complete the full role/resource permission matrix and payment-provider sandbox mismatch, replay and reconciliation tests. Feature-specific limiters outside this change may still use process-local counters.
7. Review account-role preflight results, resolve CI blockers, coordinate the PIN request contract with clients, deploy to staging, and record the deployed revision plus negative smoke tests before production.

Self-service registration still has separate identity/profile writes. Single-use proofs prevent replay, but a profile/storage failure can require fresh verification and support repair; the transaction change in SEC-18 covers administrator conversion and operator invitations specifically. Full registration recovery and provider failure testing belongs in SEC-24.

## Staging compatibility gate — 6 September 2026

Superseded 8 September 2026: passenger checkout now requests a purchase-specific phone code for wallet-only and eSewa split payments. Device and provider-sandbox acceptance remain required before staging promotion. The owner, admin, agent web and partner Flutter changes have been merged into dev; this does not validate deployed infrastructure or provider behavior.
