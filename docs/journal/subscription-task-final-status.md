# Subscription Task Final Status

## Closed in this repository

- Prodamus webhook integration in push server
- Server-side access block via PostgREST + RLS
- `paused_manual` vs `paused_expired` separation
- Subscription renewal screen UX
- Nightly reconcile fallback
- Webhook idempotency improvements
- Replayable `profile_not_found` handling
- Removed hardcoded email bypass
- Added `subscriptions.updated_at` trigger
- Added verification SQL scripts:
  - `docs/prodamus-replay-scenarios.sql`
  - `docs/rls-audit-check.sql`

## Not closed here (external dependency)

- Hard invalidation of already-issued tokens in auth-service by `session_version`

## Final external action

- Implement patch in auth-service per:
  - `docs/auth-service-session-version-patch.md`
  - `docs/auth-service-handoff.md`

After that external patch is deployed, the subscription/access-control task is fully accepted end-to-end.
