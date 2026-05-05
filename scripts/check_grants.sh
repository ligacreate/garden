#!/usr/bin/env bash
# scripts/check_grants.sh
#
# SEC-014 — мониторинг кастомных GRANT'ов на authenticated/web_anon.
# Запускается раз в 5 минут через cron, авто-восстанавливает при wipe'е.
#
# Логика:
#   1. SELECT count grant-rows для authenticated и web_anon.
#   2. Если authenticated < 100 ИЛИ web_anon < 4:
#      - WARN-лог в /var/log/garden-monitor.log
#      - Telegram alert (если TELEGRAM_BOT_TOKEN/CHAT_ID есть в env;
#        иначе только лог)
#      - Запуск /opt/garden-monitor/recover_grants.sh
#      - Пост-recovery лог + второй alert (успех/ошибка)
#   3. Иначе — silent exit 0 (cron-friendly).
#
# Зависимости:
#   /opt/garden-auth/.env       — DB_HOST/USER/PASS/NAME (+ опционально
#                                 TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID)
#   /opt/garden-monitor/recover_grants.sh
#   psql, curl
#
# Cron entry:
#   */5 * * * * root /opt/garden-monitor/check_grants.sh
#
# Threshold выбран так:
#   - authenticated baseline 158, threshold <100 ловит и полный wipe (0),
#     и частичное снятие (например, REVOKE только writes — упало бы до
#     ~39, тоже ловим).
#   - web_anon baseline 4 — любое снижение критично (всего 4 grant'а).

set -euo pipefail

ENV_FILE="/opt/garden-auth/.env"
LOG_FILE="${GARDEN_MONITOR_LOG:-/var/log/garden-monitor.log}"
RECOVERY_SCRIPT="/opt/garden-monitor/recover_grants.sh"
AUTH_THRESHOLD=100
ANON_THRESHOLD=4

log() {
    echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] check: $*" | tee -a "$LOG_FILE" >&2
}

# Telegram alert (no-op если бот не настроен).
notify_tg() {
    local text="$1"
    if [[ -n "${TELEGRAM_BOT_TOKEN:-}" && -n "${TELEGRAM_CHAT_ID:-}" ]]; then
        curl -fsS -m 10 \
            -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
            --data-urlencode "chat_id=${TELEGRAM_CHAT_ID}" \
            --data-urlencode "text=${text}" \
            --data-urlencode "parse_mode=Markdown" \
            >/dev/null 2>>"$LOG_FILE" \
            || log "WARN: Telegram alert failed (см. $LOG_FILE)"
    else
        log "Telegram alert skipped (TELEGRAM_BOT_TOKEN/CHAT_ID не настроены)"
    fi
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

# Получаем counts одним запросом (минимизируем сетевой round-trip).
read -r AUTH_CNT ANON_CNT <<<"$(psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -At -F ' ' \
    -c "SELECT
          (SELECT count(*) FROM information_schema.role_table_grants
            WHERE grantee='authenticated' AND table_schema='public'),
          (SELECT count(*) FROM information_schema.role_table_grants
            WHERE grantee='web_anon' AND table_schema='public');" 2>>"$LOG_FILE")" \
    || { log "ERROR: psql query failed"; exit 1; }

# Health check OK — silent.
if [[ "$AUTH_CNT" -ge "$AUTH_THRESHOLD" && "$ANON_CNT" -ge "$ANON_THRESHOLD" ]]; then
    exit 0
fi

# WIPE detected — alert + recovery.
WIPE_MSG="🚨 *Garden GRANT WIPE detected*\nauthenticated=${AUTH_CNT} (expected ≥${AUTH_THRESHOLD})\nweb_anon=${ANON_CNT} (expected ≥${ANON_THRESHOLD})\nStarting auto-recovery..."
log "WIPE detected: authenticated=$AUTH_CNT web_anon=$ANON_CNT — starting recovery"
notify_tg "$WIPE_MSG"

if [[ ! -x "$RECOVERY_SCRIPT" ]]; then
    log "ERROR: $RECOVERY_SCRIPT not executable / not found"
    notify_tg "❌ Garden recovery FAILED: $RECOVERY_SCRIPT not found/exec"
    exit 1
fi

if "$RECOVERY_SCRIPT" >>"$LOG_FILE" 2>&1; then
    log "recovery OK"
    notify_tg "✅ Garden GRANTs restored: ensure_garden_grants() OK, counts back to baseline (158/4)."
else
    log "ERROR: recovery script failed"
    notify_tg "❌ Garden recovery FAILED — manual intervention needed (см. $LOG_FILE на сервере)"
    exit 1
fi

exit 0
