# APPLY — развязка слоёв В1 задеплоена + данные применены

**Дата:** 2026-07-10 · **Автор:** codeexec · **Статус:** 🟢 done. Diff: [`_session/256`](2026-07-10_256_codeexec_phase3_v1_decouple_diff.md) (🟢 стратег, scope-расширение вебхука подтверждено).

## Что применено
### Код (изм.1-4) — задеплоен (rsync `billingLogic.mjs`+`server.mjs` + restart)
1. `deriveAccessMutation` finish/deactivation → `access_status: null` (не менять) + `bumpSessionVersion:false`. Убран мёртвый `autoPauseExempt`-параметр + устаревший комментарий. Покрывает Prodamus-деактивацию **и** BotHunter `expired`→`finish`.
2. `applyAccessState`: `access_status = coalesce($3, access_status)`; удалён `logout-all` (`subscription_blocked`); подчищены осиротевшие `isManualPaused`/`autoPauseExempt`.
3. `runNightlyExpiryReconcile`: помечает только `subscription_status='overdue'` (репортинг 1f), НЕ трогает `access_status`/`session_version`. Идемпотентно (WHERE `subscription_status='active'`).
4. Тесты `billingLogic.test.mjs` переписаны под В1 → **18/18 зелёные**; `node --check` чист.

**Верификация деплоя:** сервис `active`, health 200 лок+внеш. Маркеры на проде: `coalesce($3, access_status)`=1, `subscription_blocked`=0, `access_status: null`=3. Стартовый reconcile отработал по-новому:
`[billing-reconcile Europe/Warsaw] marked overdue (access NOT paused, В1): 3` — 3 профиля помечены overdue БЕЗ паузы доступа.

### Данные (изм.5) — применено (dry → commit, self-guard rowcount=8)
- DRY: ровно 8 `paused_expired` (7 intern + 1 leader), у всех `paid_until` в прошлом, `subscription_status='overdue'`.
- COMMIT (транзакция + `DO`-guard на `<>8` → EXCEPTION/rollback): `UPDATE profiles SET access_status='active' WHERE access_status='paused_expired'`.
- **Результат:** `active 48` (было 40+8), `paused_manual 12` (не тронуты), `paused_expired 0`.
- НЕ трогал: `paid_until` (в прошлом → subActive=false → Лига заперта), `subscription_status` (overdue), `session_version`, `paused_manual`.

## Итог (В1 в силе)
- `access_status` больше НЕ зависит от Лига-неоплаты. Ни reconcile, ни вебхук (finish/deactivation/BotHunter-expired) не ставят `paused_expired`.
- Лига-доступ = `subActive (paid_until≥now)`. `subscription_status` — репортинг-флаг.
- 8 ранее запертых (курс/кабинет) вернулись в `active`; Лига у них заперта по subActive до оплаты.
- Не-оплаченный intern: кабинет+курс есть, Лига заперта (TG-поллер не пускает — гейт по paid не изменён).

## Осталось по треку «кабинет-первый» (НЕ в этой сессии)
- **Фронт (окно 403):** Лига-поверхности + кнопки «Вступить в канал/чат» гейт `subActive` (связать с треком «кнопки» из 252).
- **Миграция легаси (2+1, _session/255):** `evantipina@ya.ru`, `ksu.shik@mail.ru` — завести профиль/пригласить; `hinesta@mail.ru` — доприменить платёж 01.07 (висит `is_processed=false`). Отдельный data-diff.
- **Своя SMTP-доставка join-ссылок** после `plan_payment` (гейт `plan_code`) — §10-дефолт стратега.

## Не трогал
- Гейт курса (pvlRoleResolver/COURSES) — по решению стратега (intern сохраняет курс).
- Товаро-гейт (253), идемпотентность/подпись, поллер/reconcile hard-rules.
