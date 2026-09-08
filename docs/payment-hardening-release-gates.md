# Payment hardening — implementation and release gates

This is local work on `codex/payment-ledger-hardening`. It is not a production
security certification or permission to promote the branch. No historical
customer balances have been changed.

## Implemented controls

- Wallet spending uses the ledger, exact paisa amounts and a transactional
  wallet-status lock. Refund entitlement can be credited to a frozen wallet;
  spending remains blocked. Cache updates share the ledger transaction.
- Administrative wallet adjustments require an operation ID and retain an
  actor-bound request fingerprint. Repeated requests reuse the committed result;
  a changed payload or actor is rejected.
- Protected finance routes require a current `SUPER_ADMIN` account with MFA
  enabled. This is a restrictive interim rule, pending the finance role decision.
- Passenger/operator cancellation races share a booking refund budget. Trip,
  booking, refund, cashback clawback and seat release commit together for an
  operator cancellation.
- Refund calculations use paisa and preserve new bookings' policy snapshots.
  Original-payment refunds retain a separate SM and external allocation.
- Manual external settlement requires a saved receipt/reference and a different
  finance administrator to approve it. A reference cannot settle two cases.
  This is manual review, not automated verification by the payment provider.
  Pending dispute evidence does not mark the transaction refunded.
- Provider verification requires the expected transaction, merchant and exact
  amount. Unknown provider state remains recoverable.
- New split checkout attempts require a short-lived, purchase-bound code sent to
  the registered phone before reserving SM Money and launching the gateway.
  Reservation creation is atomic and initiation retries reserve only once.
- Booking commit ties the payment attempt, processing token, booking and consumed
  ledger debit together. A completed debit cannot be reversed through checkout
  compensation. Wallet references are generated from the user and seat hold.
- Recovery can reconstruct a completed attempt's response after a crash and
  reconcile abandoned wallet debits. Checkout no longer repeats the provider
  verification after the authoritative verification succeeded.

## Further controls verified locally

- Passenger inventory, owned hold completion, transaction success and booking creation
  now commit in one transaction. An injected final-write failure leaves all four
  unchanged. Concurrent retries return one booking. Atomic fulfillment never rolls
  back unrelated pre-existing seat locks.
- eSewa transaction creation checks current processing ownership inside a transaction
  and reuses its original record. Expired or replaced workers cannot create records,
  commit a booking or compensate the current worker's attempt.
- Overlapping recovery workers reverse an abandoned wallet debit once and preserve
  active holds. Provider uncertainty older than 15 minutes appears in the protected
  finance review queue. It never authorizes an automatic refund or another charge.
- Owner payouts require finance MFA, uploaded bank evidence and independent review.
  Concurrent requests cannot reserve the same trip for multiple settlements, including
  historical received payouts. Receipt and paid status commit together. Amounts use paisa.
- Refund timing uses the authoritative trip departure time. Client booking snapshots
  cannot postpone the cancellation deadline. Invalid times fail closed and exact
  policy boundaries match the existing UTC timetable convention.
- The read-only payment index preflight checks uniqueness and partial-filter scope.
  It does not create indexes or repair data. Run it before enabling new writers.

## Still required before release

1. Mobile now uses the server-owned eSewa form and persists the reference across
   restart, with owner-scoped server discovery if initiation response is lost.
   Exercise gateway-only, wallet-only and split checkout on real devices in sandbox. The current
   passenger website exposes gateway-only checkout; do not claim split UI support.
2. Run deployment-level process-kill and restart tests against the provider sandbox.
   Local database tests now cover atomic inventory rollback, overlapping workers,
   stale processing ownership and booking-versus-compensation races. Review legacy
   orphaned seat locks on the restored backup instead of clearing ambiguous inventory.
3. Provision finance access to the payment review queue and verify it on staging.
   Confirm uncertain references in the provider dashboard. Unknown/NOT_FOUND alone
   is never sufficient to release funds. Automatic verification continues.
4. Validate retained fees, credit expiry and partial-seat rules against staging data.
   PIN-free purchase approval and passenger-selected cancellation destinations are
   implemented. Refund credit may fund the full remaining fare; promotional value
   stays capped. Manual settlement requires two eligible administrators.
   Rejection now releases budget only when no payout evidence exists, within the
   same transaction. Rejected rows stay closed; a replacement uses a new operation key.
5. Cumulative refund limits per source now pass concurrent paisa tests. Invalid
   source allocations fail closed. Review legacy allocation gaps. UTC policy boundaries are locally tested; confirm
   the deployed timetable convention and partial-seat business rules.
6. Run the existing read-only reversal audit against a restored backup with
   read-only credentials. Investigate findings before proposing any correction.
7. Verify required indexes exist before enabling new writers. These include
   the partial unique `operationKey` indexes on ledger/refund records, unique
   `paymentOperationKey` on bookings, `(scope, operationId)` on financial
   operations, `(method, reference)` on refund settlements and the existing
   attempt/hold uniqueness constraints and unique settlement trip claims. Run
   `node scripts/preflightPaymentIndexes.js` using read-only access. Preflight duplicate data first; never
   drop existing indexes or edit balances to force a migration through.
8. On staging, verify replica-set transactions, provider sandbox configuration,
   MFA finance users, proof storage/read access, worker scheduling, alerts and
   backup restoration. Match every resulting booking, debit, credit and payout.

## Callback and staging environment controls

Callbacks and provider status responses now require an exact positive paisa amount. Invalid numeric strings, excess decimal places, malformed grouping and a one-paisa mismatch fail closed. A valid signed callback still cannot replace provider verification. Database tests cover foreign users, forged callbacks, provider mismatches, absent callback data and twenty concurrent finalizations against one reserved split payment.

Checkout and status verification share sandbox/live selection and exact endpoint allowlists. `NODE_ENV=production` retains production runtime protections; the staging Compose configuration explicitly supplies `DEPLOYMENT_ENV=staging`. Compose also requires `PASSENGER_APP_URL`. New attempts store their payment environment, and resumed initiation/finalization rejects a changed merchant or environment. Historical attempts without an environment field retain merchant checking; they still require historical review before any environment migration.

The passenger website now treats a pending verification response as pending, retries it within a bounded interval, and never derives financial success/failure from the callback URL. A confirmation must contain the server's booking data before it is displayed as a ticket.

On 7 September 2026, the documented staging `/health` returned HTTP 200 with `db: connected`. The pending-payment and finance-review GET endpoints returned HTTP 404. This does not verify the feature branch on staging or prove its authorization guards. The current process has no dedicated audit connection or staging SSH configuration. No deployment or customer-data mutation was performed.

## Evidence

Focused tests are in `tests/characterization/payment-*-integrity.test.js`,
`payment-finance-operation.test.js`, `payment-refund-concurrency.test.js`, and
the checkout/payment unit and characterization tests. Workspace evidence logs
and the issue workbook live in `../outputs/01a06fcc-payment-hardening/`.
Refer to the current validation report there for the final run counts; an older
passing suite does not validate later edits.

## Scope reconciliation

The workspace contains SEC-01–SEC-25 in the original backend security workbook
and PAY-01–PAY-16 in the payment workbook. The mentioned 20-item list has not
yet been identified. Do not report 20/20 completion until those exact items are
mapped to evidence. Owner payout findings belong to the finance review scope
and are described above, not substituted for missing source items.
## Booking follow-up recovery

Passenger booking now creates cashback jobs, the in-app confirmation, and push delivery jobs inside its transaction. Cashback creation locks the booking, checks existing credit/card consistency, and commits its credit, scratch card, and job completion together. Cancellation prevents later reward creation. Coupon usage and its counter now commit with the booking; retries reuse saved usage and coupon refunds require a cancelled booking. Coupon creation no longer declares conflicting unique and nonunique indexes for the same code.

Focused verification passed: 21 database tests across cashback, coupon, notification, inventory and worker recovery, followed by 6 notification tests including invalid-token and transient-provider failures. Seventeen existing cashback and notification contract tests also passed with updated transaction fixtures. The full regression result is recorded in the current validation report.

Push delivery is at least once: a provider acknowledgement lost before saving completion can cause a repeated push. Permanently invalid device tokens do not cause endless retry. Temporary provider failures remain queued. The in-app notification is created once with the booking. Follow-up failures do not stop payment reconciliation. Historical bookings do not automatically receive new recovery jobs; restored-backup review remains required. Cashback uses configuration at generation time, preserving the current policy; no new promise of booking-time reward rates is introduced.
