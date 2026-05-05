#!/usr/bin/env bash
# scripts/recover_grants.sh
#
# SEC-014 — idempotent recovery кастомных GRANT'ов на authenticated/web_anon
# в public schema. Вызывает stored procedure public.ensure_garden_grants(),
# которая определена в phase 23 миграции (см. migrations/2026-05-05_phase23_
# grants_safety_net.sql).
#
# Использование:
#   /opt/garden-monitor/recover_grants.sh
#
# Exit:
#   0 — recovery прошла, V1/V2 counts в норме (158/4)
#   1 — что-то не так (нет env, psql упал, counts не совпали)
#
# Зависимости:
#   /opt/garden-auth/.env — содержит DB_HOST, DB_USER, DB_PASS, DB_NAME
#   psql                  — стандартный клиент Postgres

set -euo pipefail

ENV_FILE="/opt/garden-auth/.env"
LOG_FILE="${GARDEN_RECOVER_LOG:-/var/log/garden-monitor.log}"

log() {
    echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] recover: $*" | tee -a "$LOG_FILE" >&2
}

if [[ ! -f "$ENV_FILE" ]]; then
    log "ERROR: $ENV_FILE not found"
    exit 1
fi

# shellcheck disable=SC1090
set -a; . "$ENV_FILE"; set +a

if [[ -z "${DB_HOST:-}" || -z "${DB_USER:-}" || -z "${DB_PASS:-}" || -z "${DB_NAME:-}" ]]; then
    log "ERROR: DB_HOST/USER/PASS/NAME missing in $ENV_FILE"
    exit 1
fi

export PGPASSWORD="$DB_PASS"

log "calling ensure_garden_grants()"
if ! psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 \
        -c "SELECT public.ensure_garden_grants();" >/dev/null 2>>"$LOG_FILE"; then
    log "ERROR: ensure_garden_grants() failed (см. $LOG_FILE)"
    exit 1
fi

# Verify: counts в норме после recovery.
read -r AUTH_CNT ANON_CNT <<<"$(psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -At -F ' ' \
    -c "SELECT
          (SELECT count(*) FROM information_schema.role_table_grants
            WHERE grantee='authenticated' AND table_schema='public'),
          (SELECT count(*) FROM information_schema.role_table_grants
            WHERE grantee='web_anon' AND table_schema='public');" 2>>"$LOG_FILE")"

log "after recovery: authenticated=$AUTH_CNT web_anon=$ANON_CNT (expected 158/4)"

if [[ "$AUTH_CNT" -ne 158 || "$ANON_CNT" -ne 4 ]]; then
    log "ERROR: counts mismatch after recovery — manual investigation needed"
    exit 1
fi

log "OK: grants restored to baseline (158/4)"
exit 0
