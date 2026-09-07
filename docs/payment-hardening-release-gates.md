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
- New split checkout attempts reserve SM Money before gateway launch after PIN
  verification. Reservation creation is atomic and initiation retries reserve
  only once. The PIN is not stored in the attempt.
- Booking commit ties the payment attempt, processing token, booking and consumed
  ledger debit together. A completed debit cannot be reversed through checkout
  compensation. Wallet references are generated from the user and seat hold.
- Recovery can reconstruct a completed attempt's response after a crash and
  reconcile abandoned wallet debits. Checkout no longer repeats the provider
  verification after the authoritative verification succeeded.

## Still required before release

1. Mobile now uses the server-owned eSewa form and persists the reference across
   restart, with owner-scoped server discovery if initiation response is lost.
   Exercise gateway-only, wallet-only and split checkout on real devices in sandbox. The current
   passenger website exposes gateway-only checkout; do not claim split UI support.
2. Complete end-to-end crash tests around seat locking, hold completion,
   transaction success and compensation. The atomic booking/debit tests do not
   establish safety of every earlier/later orchestration write. In particular,
   test stale-worker cleanup against a newly committed booking, and orphaned
   seat locks after a process terminates.
3. Exercise the reconciliation worker itself under provider timeouts, missing
   callbacks, overlapping workers and process restarts. Unknown/NOT_FOUND
   provider responses currently retain the reservation; an operational review
   and release rule is still needed for long-lived unknown attempts.
4. Agree refund destination, retained fees, credit expiry, partial-seat rules,
   PIN replacement (if any), and finance roles. Current PIN and destination
   choices are preserved. Manual settlement requires two eligible administrators.
   Rejection now releases budget only when no payout evidence exists, within the
   same transaction. Rejected rows stay closed; a replacement uses a new operation key.
5. Cumulative refund limits per source now pass concurrent paisa tests. Invalid
   source allocations fail closed. Review legacy allocation gaps and timetable
   timezone boundaries; partial-seat business rules still require validation.
6. Run the existing read-only reversal audit against a restored backup with
   read-only credentials. Investigate findings before proposing any correction.
7. Verify required indexes exist before enabling new writers. These include
   the partial unique `operationKey` indexes on ledger/refund records, unique
   `paymentOperationKey` on bookings, `(scope, operationId)` on financial
   operations, `(method, reference)` on refund settlements and the existing
   attempt/hold uniqueness constraints. Preflight duplicate data first; never
   drop existing indexes or edit balances to force a migration through.
8. On staging, verify replica-set transactions, provider sandbox configuration,
   MFA finance users, proof storage/read access, worker scheduling, alerts and
   backup restoration. Match every resulting booking, debit, credit and payout.

## Evidence

Focused tests are in `tests/characterization/payment-*-integrity.test.js`,
`payment-finance-operation.test.js`, `payment-refund-concurrency.test.js`, and
the checkout/payment unit and characterization tests. Workspace evidence logs
and the issue workbook live in `../outputs/01a06fcc-payment-hardening/`.
Refer to the current validation report there for the final run counts; an older
passing suite does not validate later edits.
