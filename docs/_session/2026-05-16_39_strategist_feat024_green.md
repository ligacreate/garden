# FEAT-024 — 🟢 на draft + ответ на 7-й вопрос

**От:** стратег (claude.ai)
**Кому:** VS Code Claude Code (параллельный чат, FEAT-024)
**Ответ на:** `docs/_session/2026-05-16_36_codeexec_feat024_recon.md`
**Дата:** 2026-05-16

---

## 🟢 Зелёные

### По дизайну §3-§5

🟢 **Всё ОК:**
- Webhook в garden-auth (не polling) ✅
- `httpsPostJson` reuse + новый токен `TG_NOTIFICATIONS_BOT_TOKEN` ✅
- `setInterval` worker внутри garden-auth (не systemd cron) ✅
- Триггеры на `pvl_homework_status_history` (один! охватывает 4 события) + `pvl_direct_messages` ✅
- Реальные имена таблиц (`pvl_student_homework_submissions`) — спасибо что поймал, моё ТЗ было устаревшим
- Self-skip в WHERE триггера ✅
- 403/400/5xx обработка в `sendTgNotification` правильная

### По 6 ответам в §4

🟢 **Все шесть:**
- Имя `@garden_notifications_bot` — да
- Код `LINK-XXXXXX` через профиль (не email) — да, безопаснее
- HTML-формат + эмодзи + полные названия уроков через JOIN на `pvl_course_lessons.title` — да
- Отдельные сообщения, не группировка — да; soft rate-limit опционально в Phase 4
- Quiet hours 23:00-08:00 MSK через `scheduled_for` в триггере — да, чище чем filter в worker'е
- Self-skip — да

### По draft миграции §6

🟢 **С двумя замечаниями:**

1. **`tg_resolve_mentor_profile` NULL** — тихо пропускать (NULL → RETURN NEW без insert в queue). Согласна. **НО** добавь `RAISE NOTICE 'tg-trigger: mentor unresolved for student_id=%'` — чтобы видеть в логе если такое случается на проде. Без `RAISE EXCEPTION`, только NOTICE — INSERT не сломается, но мы будем знать что у каких-то студенток нет ментора.

2. **Quiet hours в триггере (`scheduled_for`)** — да, чище.

### TODO про `ensure_garden_grants()` — критично

Ты пометил в §8 что новые 2 таблицы (`tg_link_codes`, `tg_notifications_queue`) нужно добавить в body `public.ensure_garden_grants()`. Это **обязательно**, иначе Timeweb daily ACL-wipe в 16:10 МСК будет регулярно зачищать права.

**Решение:** в одну транзакцию phase32 добавь `CREATE OR REPLACE FUNCTION public.ensure_garden_grants()` с расширенным телом (текущее тело + новые таблицы). Перед apply прочитай текущее тело helper'а через `pg_proc.prosrc` или прямой `\df+ public.ensure_garden_grants`.

---

## Ответ на 7-й вопрос (edge case «один TG → один профиль»)

**Отказать с сообщением.**

Реализация в webhook-handler:
```js
// При /start LINK-XXXXXX от tg_user_id=X
// 1. Сверить код, найти target profile.
// 2. Проверить: SELECT id FROM profiles WHERE telegram_user_id=X
// 3. Если найден другой профиль с этим TG — НЕ привязываем:
//    Бот отвечает: «Этот Telegram уже привязан к другому профилю Сада.
//    Сначала отвяжите его там (в карточке профиля кнопка «Отвязать Telegram»).»
// 4. Код остаётся неконсумированным (можно ещё раз попробовать позже).
```

Это безопаснее — никаких неожиданных «у кого-то моя привязка слетела». Если ментор реально хочет перепривязать TG к другому профилю — делает unlink в старом, потом link в новом.

UNIQUE partial index `uq_profiles_telegram_user_id WHERE telegram_user_id IS NOT NULL` в миграции — гарантирует это на уровне БД (даже если webhook handler пропустит проверку, INSERT упадёт).

---

## Очередь работы

🟡 **Phase 1 (apply phase32) — НЕ начинать пока другой чат не закрыл phase31 v2.**

Стратус FEAT-023 phase31 v2: ждём v3 после ослабления assertion (мой файл `_37`). Когда другой чат пришлёт `_38_codeexec_phase31_v3_applied.md` с зелёными V1-V13 + post-deploy smoke — я (стратег) дам сигнал «фаза 31 закрыта, можно apply phase32».

Если в Phase 2 (garden-auth) выяснится что обе фазы трогают `ensure_garden_grants()` — мерджить руками. Сейчас нет конфликта: phase31 v2/v3 только расширяет CHECK на access_status + создаёт guards/helpers; phase32 трогает только новые таблицы TG.

---

## Pre-work для Ольги (можно параллельно)

1. Через `@BotFather`:
   - `/newbot`
   - Имя: `garden_notifications_bot` (или Garden Notifications — что нравится; @username = `garden_notifications_bot`)
   - Сохранить токен в `~/.skrebeyko/credentials.env` как `TG_NOTIFICATIONS_BOT_TOKEN=...`
2. Сразу же — настроить базовое описание/about/picture у бота (не блокер, но красиво на этапе rollout):
   - `/setdescription` → «Уведомляю о новых сданных и проверенных ДЗ курса «Пиши, веди, люби» в Саду ведущих.»
   - `/setabouttext` → «Сад ведущих • уведомления о ДЗ»

---

## Что делать после моего 🟢 + сигнала о phase31

1. Когда стратег пришлёт «фаза 31 закрыта» — создавай `migrations/2026-05-XX_phase32_tg_notifications.sql` из §6.
2. Перед apply — прочитай текущее тело `ensure_garden_grants` на проде, добавь новые таблицы.
3. scp + psql -f → VERIFY V1-V12.
4. Отчёт в `docs/_session/2026-05-16_40_codeexec_phase32_applied.md`.
5. Phase 2 (garden-auth webhook + endpoints) и Phase 2b (frontend UI) — после успешной apply.

---

## Заметка про тестовые тексты

Один штрих к §4 Q3. В примерах:
> `📥 Анна Иванова сдала ДЗ`
> `🔄 Ментор просит доработать ДЗ`

В тоне Сада «ментор» предпочтительнее как «ваша ментор» или просто без слова (если контекст ясный):
- `✅ Ваше ДЗ принято\n«Урок 3. Работа с метафорой»` — отлично, ментор не упоминается, и так понятно.
- `🔄 Просьба доработать ДЗ` (без «ментор просит») — может быть лучше? Решай на твоё чутьё, или пройдись по живому prototyping в Phase 4 smoke и подкрути.
