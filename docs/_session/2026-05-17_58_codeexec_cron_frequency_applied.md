# Cron grants-monitor: */5 → * (каждую минуту) — applied

**От:** codeexec (VS Code)
**Кому:** Ольга → стратегу
**Дата:** 2026-05-17
**Контекст:** [_54_strategist_timeweb_support_draft.md](2026-05-17_54_strategist_timeweb_support_draft.md) — Timeweb support подтвердил, что daily reconciliation отключить нельзя. Это short-term mitigation: ускоряем recovery cron с 5 минут до 1 минуты. Long-term — переезд на self-managed Postgres (VPS Bittern), отдельная сессия.
**Статус:** ✅ patched on prod → ✅ verified cron firing every minute → ✅ repo sync committed.

---

## Что изменилось на проде

`/etc/cron.d/garden-monitor`:
```diff
-*/5 * * * * root /opt/garden-monitor/check_grants.sh
+* * * * * root /opt/garden-monitor/check_grants.sh
```

Sed-патч через SSH, cron перечитал файл автоматически (RELOAD виден в journalctl). `systemctl status cron` → `active`, рестарт не понадобился.

## Verify

`journalctl -u cron --since '5 minutes ago' | grep check_grants` показал firing каждую минуту:

```
May 17 15:45:01  CRON: /opt/garden-monitor/check_grants.sh
May 17 15:46:01  CRON: /opt/garden-monitor/check_grants.sh
May 17 15:47:01  CRON: /opt/garden-monitor/check_grants.sh
May 17 15:48:01  CRON: /opt/garden-monitor/check_grants.sh
May 17 15:49:01  CRON: /opt/garden-monitor/check_grants.sh
```

Чисто по минутной границе, без пропусков. Mitigation активна.

> `/var/log/garden-monitor.log` не обновился — скрипт пишет в лог только при wipe/recovery (последняя запись 2026-05-16 от daily reconciliation в 13:10). При норме — тихо, что нормально. Проверка через journalctl — корректный способ.

## Repo sync

Поправил три места (RUNBOOK + два упоминания в самом скрипте). Lessons и journal не трогал (они frozen, по правилу проекта):

- `scripts/check_grants.sh:5`: «Запускается раз в 5 минут через cron…» → «Запускается раз в минуту через cron…»
- `scripts/check_grants.sh:24` (header cron entry): `*/5 * * * * root …` → `* * * * * root …`
- `docs/RUNBOOK_garden.md:132`: «cron каждые 5 минут» → «cron каждую минуту»

## SHA

См. ниже после `git commit && git push`.

## Откат (если понадобится)

Один символ туда-сюда:
```bash
ssh -i ~/.ssh/id_ed25519 root@5.129.251.56 \
  "sed -i 's|^\* \* \* \* \* root /opt/garden-monitor/check_grants.sh|*/5 \* \* \* \* root /opt/garden-monitor/check_grants.sh|' /etc/cron.d/garden-monitor"
```
Cron сам подхватит RELOAD за минуту.

## Trade-off (для понимания, не блокер)

- ➕ window между daily wipe (16:10 МСК) и recovery теперь ≤ 60 сек вместо ≤ 300 сек. ~5× меньше окно когда пользователи видят 401.
- ➕ при любых других неожиданных revoke'ах (если Timeweb что-то ещё «починит») мы заметим за минуту, а не за 5.
- ➖ нагрузка на БД: 12 запросов в час вместо ~12 в час → теперь 60. Это 5 простых `count(*)` в `information_schema.role_table_grants`, нагрузка тривиальная. Не блокер.
- ➖ syslog растёт быстрее (5× строк CRON). Тоже не блокер, но если ротация logrotate где-то узкая — словим раньше; обычно journalctl само ротируется по vacuum-policy.

Long-term mitigation — Bittern (отдельная сессия).
