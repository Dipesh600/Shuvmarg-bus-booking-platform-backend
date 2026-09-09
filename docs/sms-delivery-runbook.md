# SMS delivery rollout and recovery

Business SMS is stored in `notificationoutboxes` before delivery. OTP and SM Money authorization codes remain synchronous and are never sent by this worker.

## Deployment order

1. Run `npm run db:index:notification-outbox` against the target database.
2. Deploy with `SMS_OUTBOX_WORKER_ENABLED=false`, or leave it unset. The worker requires the exact value `true`, a configured `SPARROW_SMS_TOKEN` and valid message types before it starts. Confirm booking, invitation, fleet, KYC and refund actions create one outbox record each.
3. Set `SMS_OUTBOX_ENABLED_TYPES` to a comma-separated pilot list such as `AGENT_INVITATION,CREW_INVITATION`.
4. Set `SMS_OUTBOX_WORKER_ENABLED=true` and restart one backend instance.
5. Review `/admin/sms-delivery`. Confirm queue age falls, retries are bounded, and provider authentication is healthy before adding more message types.
6. Enable `BOOKING_CONFIRMED`, `BOOKING_CANCELLED` and `REFUND_STATUS` only after the invitation pilot is stable.

An empty `SMS_OUTBOX_ENABLED_TYPES` enables every supported family. Use an explicit pilot list during staging and the first production rollout.

## Failure drills

- Remove the Sparrow token in staging. One controlled configuration alert should appear; messages remain queued and resume after the token is restored.
- Force a timeout or provider 5xx. The job should retry after about 1 minute, 5 minutes, 15 minutes and 1 hour, then remain failed for review.
- Use an invalid phone number. The job should fail permanently without retrying.
- Stop a worker after it claims a job. Another instance should recover it after the two-minute lease expires.
- Submit the same business action twice. The idempotency key should leave one message for that transition.
- Cancel a booking before its confirmation SMS sends. The confirmation should become `CANCELLED`.

## Operations

The admin SMS page shows masked recipients and sanitized errors. Only `SUPER_ADMIN` and `ADMIN` accounts can view it or replay a failed message. Every replay requires a reason, records the administrator, and is rate-limited. Expired messages must be recreated from their invitation or business action so stale content is not sent.

`PROVIDER_ACCEPTED` means Sparrow accepted the request. It does not prove handset delivery. Keep `DELIVERED` unused until Sparrow provides merchant-specific delivery-receipt documentation and a callback authentication method. Do not implement a callback from examples or unofficial assumptions.

To pause delivery without deleting work, set `SMS_OUTBOX_WORKER_ENABLED=false` and restart the backend. Queued records remain available for a later recovery. The worker stays disabled when the flag is missing or invalid.
