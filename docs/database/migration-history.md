# Database Migration History

This file records completed historical data migrations. The original one-time
migration scripts were removed from the application repository after completion.

## Completed migrations

- Operator brand IDs were backfilled across trips, bookings, and fleets.
- Stop departure estimates were backfilled for route configurations.
- Historical trips were generated for required date ranges.
- Legacy stop records were categorized.
- Duplicate stops were consolidated.
- Legacy corridor data was migrated to the corridor registry.
- Legacy stop data was migrated to the unified stop registry.
- Existing wallet balances were migrated to the SM Ledger.
- Operator route configurations were migrated to the trip-pattern architecture.
- User identities were migrated to the multi-role model.
- Bus owners and fleets were migrated to operator-brand entities.
- Trip dates were converted from strings to BSON Date values.
- Legacy boarding points were migrated to stop-point records.

## Operational note

These migrations are historical and must not be rerun from the application
repository. Any future data correction must be implemented as a new reviewed,
environment-controlled migration.
