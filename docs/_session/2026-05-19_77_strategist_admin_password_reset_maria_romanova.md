# Admin password reset — Maria Romanova

**Type:** P0 recovery action (NOT a migration, NOT a schema change).
**Initiated by:** стратег (claude.ai).
**Executed by:** codeexec (VS Code Claude) via `psql` from VPS Bittern.
**Applied:** 2026-05-19 12:41 МСК (`2026-05-19T09:41:05Z`).

## Subject

| field | value |
|---|---|
| user id | `58b74756-1d4f-4b40-94af-63f8778f1d79` |
| email | `masha152@yahoo.com` |
| status (post-reset) | `active` |

## What changed in `users_auth`

- `password_hash` ← new bcrypt hash (`$2a$10$…`, length 60). Old hash overwritten.
- `reset_token` ← `NULL` (cleared any pending reset flow).
- `reset_expires` ← `NULL`.

UPDATE affected **1 row**. Verification via `RETURNING` confirmed `hash_len=60` and `prefix=$2a$`.

## Temp credentials

A temporary password was set. **Plaintext is intentionally NOT recorded in this file or in git** — handled out-of-band by the strategist to the user. Maria must change it on first login.

## Apply notes / deviations from strategist's paste-ready script

1. **`bcrypt` → `bcryptjs`** — garden-auth uses `bcryptjs ^2.4.3` (see `/opt/garden-auth/package.json`), not native `bcrypt`. Functionally identical (same `$2a$` hash format, verified by the running auth-service on every login). Confirmed with the strategist before swap.
2. **`bcrypt.hash().then(...)` → `bcryptjs.hashSync(...)`** — synchronous variant chosen to eliminate the small risk of `node -e` exiting before an async Promise resolves (which would write an empty `password_hash` and lock the user out irrecoverably). Confirmed with the strategist before swap.
3. **Pre-flight guard** — bash check that `${#TEMP_HASH} == 60` and `${TEMP_HASH:0:2} == "$2"` runs **before** the SQL UPDATE. On failure → `exit 1`, UPDATE skipped, DB untouched.
4. **First attempt failure** — `Cannot find module 'bcrypt'` (expected, see #1). DB not touched (failed at hash-gen stage, before `psql`).

## Why this was needed

Maria could not authenticate (lost / expired credentials). Self-service reset flow not available or not viable in this case (details with the strategist). Admin reset is the unblock.

## Root cause / follow-up flags

- This is symptom relief, not a root-cause fix. If admin-reset turns into a recurring need, consider a proper admin UI in garden-auth instead of direct `psql`. Track separately.
- The temp password (`LigaTemp2026!` pattern) is shared across recovery events — single-use only by convention. Recommend Maria rotate immediately at first login.

## Commit policy

Per strategist instruction: **accumulate this document into the end-of-day batch commit**, no separate commit/push for this single audit-trail file. See [[feedback-backlog-batches-not-micro-docs]].
