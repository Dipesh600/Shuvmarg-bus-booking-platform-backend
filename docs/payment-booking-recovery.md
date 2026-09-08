# Payment received without a ticket

Local implementation checkpoint, 8 September 2026. This is not a deployment or
confirmation that every payment-policy change is complete.

## Recovery behavior

- Save the original checkout and SM reservation before gateway launch.
- Recheck the provider's transaction, merchant and exact amount before fulfillment.
- A PAYMENT_RECEIVED record without a booking can resume the same transaction.
- The current payment lease owner may restore its still-active processing hold.
  Expired or released holds are not revived. Booking commit still checks trip,
  inventory, ownership and the original SM allocation atomically.
- An interrupted fulfillment receives up to three retries separated by 30 seconds.
  Repeated client polling cannot accelerate this retry budget. Workers sweep every
  30 seconds; actual latency depends on provider response time and queue size.
- If commit succeeded but returning the result failed, return the existing ticket.
- If fulfillment cannot complete, close the attempt and release its hold in the
  same transaction that restores SM and records an original-source refund pending.
  That closed attempt cannot issue a ticket later.
- The legacy reconciliation sweep skips attempt-owned transactions so it cannot
  dispute them while a recovery worker is still completing the booking.
- For failed-fulfillment refunds, periodically check the provider. Only an
  identity-verified FULL_REFUND closes the external refund. Partial, unknown and
  mismatched responses remain pending. Concurrent confirmations restore SM once.

## Provider boundary

No automated eSewa refund-initiation endpoint is wired. A pending refund is a
durable local obligation, not evidence that eSewa accepted a payout request.
The existing independently reviewed manual settlement path remains available.

Official ePay V2 documentation publishes transaction status enquiry, including
FULL_REFUND and PARTIAL_REFUND, but does not establish a refund-initiation contract:
https://developer.esewa.com.np/pages/Epay-V2

The documented Intent cancellation API excludes successfully completed payments;
it cannot be substituted for a captured-payment refund:
https://developer.esewa.com.np/pages/Intent

Developer articles were searched at the user's request. They do not establish
merchant authorization, supported refund parameters, idempotency or settlement
guarantees. Confirm those with eSewa before connecting refund initiation.

## PIN-free purchase authorization

- Payment PIN endpoints are retired and checkout no longer reads a PIN. Legacy
  PIN fields are absent from the wallet schema and response. Run the supplied
  migration separately to erase old stored hashes after backup verification.
- Any wallet or split payment first creates a five-minute approval for the
  authenticated passenger, registered phone, current session version, owned
  seat hold, server price, payment split and booking details.
- The six-digit code is stored only as a keyed hash, limited to five guesses and
  three sends per account per 15 minutes. A successful approval cannot authorize
  a changed amount, gateway, passenger, hold or session. The same purchase may
  reuse it for idempotent crash recovery.
- Gateway-only checkout continues through the provider's authorization and does
  not require the SM Money code.

## Agreed policy still requiring implementation

- Offer SM or original-source destination for passenger and operator cancellation.
  Operator cancellation's passenger-choice workflow still needs implementation.
- Refund SM may fund an entire future ticket; promotional credit and coupons have
  separate limits. Verify source classification and allocation end to end.
- On failed fulfillment, restore each split contribution to its original source.

## Verification and release

The crash-recovery tests use temporary MongoDB replica sets and simulated provider
responses. They cover both sides of the booking commit, exhausted recovery, expired
holds, stale owners, unknown payments and concurrent refund confirmation. They do
not exercise a real eSewa refund or process termination on deployed infrastructure.

Before release: validate current provider endpoints and merchant configuration,
run device/sandbox and deployed process-kill journeys, check indexes and worker
monitoring, and audit legacy data from a restored backup. No historical balances
or old disputes are automatically reclassified by this checkpoint.
