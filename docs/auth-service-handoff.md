# Auth-Service Handoff (Final External Step)

This repository already enforces subscription blocking at the data layer (PostgREST + RLS).  
The remaining step is to enforce session invalidation for already-issued tokens in `auth-service` (`auth.skrebeyko.ru`).

## Target Service

- Apply this patch in the standalone auth service behind `https://auth.skrebeyko.ru`
- Do **not** implement it in `liga.skrebeyko.ru` frontend/backend repo

## Required Changes

1. **Token/session issue**
   - Include `user_id`
   - Include `session_version` from `public.profiles` at issue time

2. **Validation on every protected check**
   - In middleware and auth endpoints, compare token/session `session_version` with current DB value
   - If mismatch: return `401`, treat token as revoked

3. **Mandatory verification points**
   - `/auth/me`
   - `/auth/refresh`
   - token verification middleware for all protected endpoints
   - auto-login on old token
   - open-new-tab token validation

4. **`/auth/logout-all` behavior**
   - Must perform real invalidation (server sessions or session_version-based revocation)
   - Must not be decorative

## Expected Result

- Webhook `finish` / `deactivation` bumps `profiles.session_version`
- Old tokens fail in auth-service (`401`)
- User is removed from auth state, not only blocked by RLS data access

## Test Plan

1. Login with active subscription -> `/auth/me` is OK.
2. Increment `profiles.session_version` manually.
3. Old token fails on `/auth/me`.
4. Old refresh token fails on `/auth/refresh`.
5. New login returns token with new `session_version`.
6. After `auto_payment` and re-login, access works again.

## Acceptance Criteria

- RLS blocks private data in `liga`
- auth-service rejects old tokens by `session_version`
- `logout-all` has real effect
- user cannot remain logged in via stale token/tab after subscription end

## Reference

- Detailed implementation notes: `docs/auth-service-session-version-patch.md`
