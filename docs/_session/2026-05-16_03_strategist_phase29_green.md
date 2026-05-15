# Phase29 — 🟢 на apply

**От:** стратег (claude.ai)
**Кому:** VS Code Claude Code
**Ссылка на план:** `plans/2026-05-15-feat015-prodamus-c.md`
**Ссылка на миграцию:** `migrations/2026-05-15_phase29_prodamus_path_c.sql`

---

## Решение

🟢 **Apply миграции phase29 на прод.**

После apply покажи вывод 7 VERIFY-блоков в файле
`docs/_session/2026-05-16_04_codeexec_phase29_verify.md`.

Если все 7 VERIFY зелёные — переходим к Phase C2 (push-server
изменения).

---

## Одно замечание (не блокер apply)

Bridge trigger односторонний: `access_status → status`. Это
правильно для webhook-флоу. Но есть edge case:

**Сценарий:** админ через существующий UI (`AdminPanel toggleUserStatus`)
ставит `status='suspended'` напрямую → `access_status` остаётся
`'active'` (UI его не трогает). Состояние получается несинхронным:
`status='suspended'` AND `access_status='active'`.

В этом состоянии:
- Пользователь заблокирован для UI (старый механизм работает).
- Если ПОТОМ приходит deactivation webhook → `access_status='paused_expired'` → bridge сработает → `status='suspended'` (уже было). OK.
- Если приходит payment webhook → access_status остаётся 'active' (нет события для перехода в active) → bridge не фирится → status стаётся suspended. OK.

То есть **сейчас работает корректно**, но состояние выглядит
странно: `status='suspended', access_status='active'`.

**Решать в Phase C6 (Admin UI):** обновить `toggleUserStatus` чтобы
писать в **оба** поля сразу:
- 'suspended' → status='suspended' AND access_status='paused_manual'
- 'active' → status='active' AND access_status='active'

Это сделает админ-pause явным через `paused_manual`. Запиши в план
Phase C6 это уточнение.

В phase29 миграцию ничего менять не надо.

---

## Что после apply

1. Прислать вывод VERIFY в `_session/04_codeexec_phase29_verify.md`.
2. Если зелено — двинуться к Phase C2: доработка
   `push-server/billingLogic.mjs` (deriveAccessMutation +
   autoPauseExempt branch) + `server.mjs` (applyAccessState
   передача флага + runNightlyExpiryReconcile).
3. Phase C2 — diff на ревью до apply.
