# Auth Service Patch: `session_version` Enforcement

## Goal

Close the last gap for already-issued sessions: every authenticated request must be rejected when JWT/session version differs from `profiles.session_version`.

## Contract Change

- `POST /auth/login` and token refresh endpoint MUST include `session_version` claim in JWT.
- `GET /auth/me` MUST validate token `session_version` against DB `profiles.session_version`.
- Any protected endpoint guarded by auth middleware MUST validate the same way.

## Required JWT Claim

- Claim name: `session_version`
- Type: integer
- Source: `public.profiles.session_version` at token issue time

## Middleware Pseudocode

```js
async function authGuard(req, res, next) {
  const token = extractBearer(req);
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const payload = verifyJwt(token); // throws on signature/exp/aud/iss mismatch
  const userId = payload.sub;
  const tokenSessionVersion = Number(payload.session_version);
  if (!Number.isFinite(tokenSessionVersion)) {
    return res.status(401).json({ error: 'Invalid session token' });
  }

  const row = await db.oneOrNone(
    `select session_version from public.profiles where id = $1 limit 1`,
    [userId]
  );
  if (!row) return res.status(401).json({ error: 'User not found' });

  const currentSessionVersion = Number(row.session_version || 1);
  if (tokenSessionVersion !== currentSessionVersion) {
    return res.status(401).json({ error: 'Session revoked' });
  }

  req.user = { id: userId, email: payload.email, role: payload.role };
  next();
}
```

## Login/Refresh Pseudocode

```js
async function issueJwtForUser(userId, extraClaims = {}) {
  const row = await db.one(
    `select id, email, role, session_version from public.profiles where id = $1`,
    [userId]
  );

  return signJwt({
    sub: row.id,
    email: row.email,
    role: row.role,
    session_version: Number(row.session_version || 1),
    ...extraClaims
  });
}
```

## Error Semantics

- Mismatch `session_version` -> `401 Session revoked`
- Missing/invalid claim -> `401 Invalid session token`
- Keep `POST /auth/logout-all` as accelerator only (optional), not as source of truth.

## DB Query Checklist

- Read on login/refresh:
  - `select session_version from public.profiles where id = $1`
- Read on each protected request:
  - same query in middleware
- No schema changes required if `session_version` already exists.

## Test Checklist

- Login, call `/auth/me` -> 200.
- Increment `profiles.session_version` manually -> old token `/auth/me` returns 401.
- Login again -> new token works.
- Two parallel tabs with old token both fail after version bump.
