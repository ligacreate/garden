#!/usr/bin/env bash
# Сценарии check_grants.sh с подставным psql. Прод не трогаем, база не нужна.
#
# Ловим инцидент 2026-08: недоступная база давала «WIPE detected» с пустыми
# значениями И ЗАПУСКАЛА восстановление грантов, которых никто не снимал.
# Причина — код возврата psql терялся в `read ... <<<"$(psql ...)"`.
#
# Запуск:  bash scripts/check_grants.test.sh scripts/check_grants.sh
set -uo pipefail

SCRIPT="${1:-$(dirname "$0")/check_grants.sh}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

cat >"$TMP/.env" <<'EOF'
DB_HOST=localhost
DB_USER=test
DB_PASS=test
DB_NAME=test
EOF

# Подставной recover: отмечается в файле, если его позвали
cat >"$TMP/recover.sh" <<EOF
#!/usr/bin/env bash
echo called >> "$TMP/recover_called"
exit 0
EOF
chmod +x "$TMP/recover.sh"

mkdir -p "$TMP/bin"
ok=0; bad=0
check() { if [[ "$2" == "$3" ]]; then echo "  ✔ $1"; ok=$((ok+1)); else echo "  ✖ $1 (ждали '$3', получили '$2')"; bad=$((bad+1)); fi; }

run_case() {           # имя, тело подставного psql, ожидаемый код, ожидан ли recovery
    local name="$1" body="$2" want_rc="$3" want_recover="$4"
    printf '#!/usr/bin/env bash\n%s\n' "$body" > "$TMP/bin/psql"
    chmod +x "$TMP/bin/psql"
    rm -f "$TMP/recover_called" "$TMP/monitor.log"
    PATH="$TMP/bin:$PATH" \
    GARDEN_MONITOR_ENV="$TMP/.env" \
    GARDEN_MONITOR_LOG="$TMP/monitor.log" \
    GARDEN_MONITOR_RECOVERY="$TMP/recover.sh" \
    bash "$SCRIPT" >/dev/null 2>&1
    local rc=$?
    local recovered=нет; [[ -f "$TMP/recover_called" ]] && recovered=да
    echo "── $name"
    check "код возврата" "$rc" "$want_rc"
    check "восстановление: $want_recover" "$recovered" "$want_recover"
    LAST_LOG="$(cat "$TMP/monitor.log" 2>/dev/null || true)"
}

echo "=== СЛОМАННЫЙ ЗАПРОС: recovery запускаться НЕ должен ==="
run_case "база недоступна (psql падает)" 'echo "could not connect" >&2; exit 2' 1 нет
grep -q "НЕ снос грантов" <<<"$LAST_LOG" && echo "  ✔ в логе сказано, что это не снос грантов" && ok=$((ok+1)) \
  || { echo "  ✖ в логе нет пояснения про «не снос грантов»"; bad=$((bad+1)); }
grep -q "WIPE detected" <<<"$LAST_LOG" && { echo "  ✖ ложный «WIPE detected» вернулся"; bad=$((bad+1)); } \
  || { echo "  ✔ ложного «WIPE detected» нет"; ok=$((ok+1)); }

run_case "psql молчит (пустой вывод, код 0)" 'exit 0' 1 нет
run_case "psql вернул мусор" 'echo "ERROR: syntax"; exit 0' 1 нет
run_case "вернулось одно число вместо двух" 'echo "158"; exit 0' 1 нет

echo
echo "=== ЖИВАЯ БАЗА: поведение прежнее ==="
run_case "гранты на месте (158 4)" 'echo "158 4"; exit 0' 0 нет
run_case "настоящий wipe (0 0)" 'echo "0 0"; exit 0' 0 да
run_case "частичное снятие (39 4)" 'echo "39 4"; exit 0' 0 да
run_case "web_anon просел (158 2)" 'echo "158 2"; exit 0' 0 да

echo
echo "итого: ✔ $ok, ✖ $bad"
[[ "$bad" -eq 0 ]]
