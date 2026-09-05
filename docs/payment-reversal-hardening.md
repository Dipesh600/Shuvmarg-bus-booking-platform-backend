# Payment reversal hardening — PAY-01 to PAY-03

FIFO spending already reduces the source credit's remaining amount. The previous
reversal restored that source and issued a compensation credit, so crediting 100,
spending 40 and reversing produced 140. A reversal now creates only the
compensation. Original consumption history and debit notes are preserved.

The original debit receives a reference to its compensation in the same MongoDB
transaction. Competing requests write that debit; transaction retry then returns
the existing compensation. A consumed compensation cannot be replenished by retry.
Ambiguous legacy history fails with a reconciliation error instead of adding value.
Credit expiry follows the existing compensation-credit policy.

PAY-06 also has a local retry-reference correction: split compensation returns
failure objects, so the coordinator now clears the debit reference only on an
explicit successful reversal. Previously it discarded the reference after any
attempt. Regression tests reproduce a failure followed by a successful retry.
This preserves in-process recovery; it does not provide durable crash recovery
or a wallet reservation. Those parts of PAY-06 remain open.

## Historical audit

`scripts/auditDebitReversals.js` streams JSON Lines with record IDs, amounts and
reason codes. It does not update balances, create collections or create indexes.
Use a database account restricted to read access, supplied through the dedicated
`PAYMENT_AUDIT_MONGODB_URI` environment variable. No default application connection
is loaded. Run `node scripts/auditDebitReversals.js > reversal-audit.jsonl` against
an isolated restored backup first. Keep reports in restricted storage.

The final summary is required to consider a report complete. Counts are records,
not users or unique incidents. Duplicates appear once per compensation. A legacy
flag means review is required; it does not establish a recoverable debt. The old
code erased consumption links, so this report cannot reconstruct exact historical
over-crediting. Reconcile flagged records with retained payment and booking
evidence before proposing any correction. No automatic correction is included.

Reads use majority concern, but the full scan is not a single snapshot. Use a
restored backup for a consistent audit. Scanning all reversals and marked debits
can be expensive; assess volume first. The new non-unique relationship index
supports reversal lookups. Deploy indexes using the normal operational process.

## Validation and rollout

Database regression tests cover balance conservation, sequential and concurrent
replays, spending then replaying, rollback after credit insertion, invalid input,
legacy duplicates, mismatched credits and read-only audit behavior. Existing
wallet and booking compensation tests remain part of the regression checks.

Before rollout, drain old payment workers and requests that could run the previous
reversal implementation. Do not operate both implementations concurrently: older
workers do not honor the new marker. A rollback to the old reversal is unsafe;
pause affected payment operations and deploy a forward fix instead.

Local tests do not establish production data health. PAY-03 remains open until
the read-only historical audit is reviewed. Provider sandbox journeys, split
payment recovery, refund policy and the other tracker issues remain release gates.
