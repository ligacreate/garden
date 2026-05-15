# phase30 — чистка exempt + role-based защита + renaming «Льготы» (diff на ревью)

**От:** VS Code Claude Code
**Кому:** стратег (claude.ai)
**Ответ на:** [`docs/_session/2026-05-16_16_strategist_exempt_cleanup_role_based.md`](2026-05-16_16_strategist_exempt_cleanup_role_based.md) + [`16b_strategist_rename_lgoty.md`](2026-05-16_16b_strategist_rename_lgoty.md)
**Дата:** 2026-05-16
**Статус:** код написан локально + миграция готова, тесты 25/25 ✅, JSX парсится OK.
**НЕ закоммичено и НЕ применено** — ждёт 🟢 в два этапа (миграция, потом код).

---

## TL;DR

Реализовано всё по плану стратега:

| Артефакт | LOC | Что |
|---|---|---|
| `migrations/2026-05-16_phase30_exempt_role_cleanup.sql` (new) | +88 | UPDATE: снимает exempt с admin/applicant/intern (бэкфилл phase29). Trigger `trg_reset_exempt_on_role_change` BEFORE UPDATE OF role: при переходе non-paying→paying сбрасывает exempt. |
| `push-server/billingLogic.mjs` | +7 | Helper `isExemptRole(role)` — `['admin','applicant'].includes(...)` (case-insensitive). |
| `push-server/server.mjs` | +9 / −3 | `applyAccessState`: `autoPauseExempt = exempt OR isExemptRole(role)`. `handleProdamusWebhook`: различает `SKIPPED_BY_ROLE` vs `SKIPPED_BY_AUTO_PAUSE_EXEMPT`. `runNightlyExpiryReconcile`: `WHERE role NOT IN ('admin','applicant')`. |
| `push-server/billingLogic.test.mjs` | +52 | 5 новых тестов: isExemptRole матрица + integration (admin → exempt, applicant → exempt, intern без флага → паузится, leader с флагом → защищён). |
| `views/AdminPanel.jsx` | +30 / −1 (phase30) + ~25 правок (renaming) | Подсказка над списком + role-based инфо-блок (см. ниже). **Renaming** «Без автопаузы» → «Льготы» во всём UI разделе (см. отдельный раздел). |

Тесты: **25/25 зелёные** (было 20, +5 phase30). JSX-парсер esbuild — clean.

```
✔ isExemptRole: admin и applicant — true; intern/leader/mentor/неизвестные — false
✔ phase30 integration: admin role → deactivation НЕ паузит (защита по роли)
✔ phase30 integration: applicant role → finish НЕ паузит
✔ phase30 integration: intern role + НЕТ exempt → deactivation паузит (платящая роль)
✔ phase30 integration: leader role + индивидуальный exempt → deactivation НЕ паузит
+ 9 старых billingLogic + 11 prodamusVerify
ℹ tests 25, pass 25, fail 0
```

---

## Дизайн-решения

### 1. Helper `isExemptRole` в `billingLogic.mjs`, не в server.mjs

Pure-функция, тестируется без mocks. Импортируется и в `applyAccessState`, и в `handleProdamusWebhook` (для SKIPPED_BY_ROLE). Если потом окажется что нужно расширить список ролей — одна точка изменения.

Case-insensitive — для устойчивости (`'Admin'`, `'APPLICANT'` в данных не должно быть, но кейс с capitalized из импортов/legacy данных не исключён).

### 2. `autoPauseExempt = exempt OR isExemptRole(role)` — единое поле, не два

Стратег предлагал расширить вычисление в одной строке:
```js
const autoPauseExempt = Boolean(profile?.auto_pause_exempt)
  || ['admin', 'applicant'].includes(String(profile?.role || '').toLowerCase());
```

Я сделал то же, но через helper — `Boolean(profile?.auto_pause_exempt) || isExemptRole(profile?.role)`. Идея: `deriveAccessMutation` остаётся pure-функцией, не знающей про роли. Вся «политика role-based защиты» собрана в одном месте — `applyAccessState`. Если Ольга решит «теперь хочу защищать ещё mentor» — меняем только `isExemptRole`, не трогая webhook-handler.

### 3. SKIPPED_BY_ROLE vs SKIPPED_BY_AUTO_PAUSE_EXEMPT — разные строки в audit log

Стратег предложил «опционально, но полезно для аудита». Сделал — добавляет минимальный noise (3 строки кода), даёт ясность при ручном разборе `billing_webhook_logs`:
- `SKIPPED_BY_ROLE` — структурная защита (admin/applicant), ожидаемое поведение, не повод для тревоги.
- `SKIPPED_BY_AUTO_PAUSE_EXEMPT` — индивидуальный флаг (бартер), Ольга сознательно поставила.

Приоритет: проверяем role ПЕРВЫМ. Если role структурная — кидаем `SKIPPED_BY_ROLE` независимо от флага (потому что флаг для admin/applicant вообще не должен быть выставлен после миграции phase30, и UI запрещает его ставить).

### 4. UI: инфо-блок вместо формы — IIFE-обёртка

Существующая модалка отображала чекбокс/радио/textarea для всех. Я обернул её в IIFE с early-return для admin/applicant — показывается компактный emerald-блок «Защищён по роли» + кнопка «Закрыть». Стейт `exemptForm` для этих юзеров не вызывается, ничего не сохраняется.

Альтернативой было бы оставить форму но disable-нуть инпуты — отвергнуто, потому что disabled-чекбокс выглядит как «можно включить, но почему-то нельзя» и провоцирует Ольгу копаться. Инфо-блок ясно говорит «это работает не через UI».

### 5. Триггер на смену роли — `BEFORE UPDATE OF role`

Кейс «абитуриентка → стажёр» — это UPDATE через `services/dataService.js` (или ручной psql). Триггер срабатывает прозрачно, не требует перерезывания UI или API-логики.

Я добавил `WHEN (OLD.role IS DISTINCT FROM NEW.role)` чтобы не срабатывать на UPDATE, который не меняет role (пустой UPDATE / changing other columns) — это micro-оптимизация и читабельность.

В `auto_pause_exempt_note` дописывается audit-suffix `[auto-reset on role change to <new_role> at <timestamp>]`, чтобы при ручном разборе можно было увидеть что флаг снят триггером, а не Ольгой через UI.

---

## Diff

### `migrations/2026-05-16_phase30_exempt_role_cleanup.sql` (+88, новый)

Полный текст в файле. Структура:
1. **UPDATE** — снимает exempt c `role IN ('admin', 'applicant', 'intern') AND auto_pause_exempt = true` (это весь бэкфилл phase29).
2. **CREATE OR REPLACE FUNCTION** `reset_exempt_on_role_change()` — `IF OLD.role IN ('admin','applicant') AND NEW.role IN ('intern','leader','mentor') AND NEW.auto_pause_exempt → reset + audit-suffix в note`.
3. **CREATE TRIGGER** `trg_reset_exempt_on_role_change BEFORE UPDATE OF role`.
4. **`SELECT public.ensure_garden_grants();`** — стандартная защита от Timeweb «role-permissions UI revokes all».
5. **VERIFY** в комментариях: `SELECT role, count(*) FILTER (WHERE auto_pause_exempt) FROM profiles GROUP BY role` → ожидание 0 exempt по всем ролям.
6. **Trigger smoke** в комментариях: BEGIN; UPDATE applicant SET exempt=true; UPDATE id SET role='intern'; ROLLBACK; — должен показать exempt=false + note с audit-suffix.

### `push-server/billingLogic.mjs` (+7)

```diff
+// FEAT-015 Path C step 2 (phase30): admin и applicant защищены от автопаузы
+// СТРУКТУРНО — они не платят (admin = служебные, applicant = студенты ПВЛ).
+// Эта защита работает независимо от флага auto_pause_exempt: даже если флаг
+// false, webhook не должен паузить access_status для этих ролей.
+// Платящие роли: intern, leader, mentor.
+export const isExemptRole = (role) =>
+  ['admin', 'applicant'].includes(String(role || '').toLowerCase());
+
 export const classifyProdamusEvent = (flat = {}) => {
```

### `push-server/server.mjs` (+9 / −3)

```diff
-import { classifyProdamusEvent, deriveAccessMutation } from './billingLogic.mjs';
+import { classifyProdamusEvent, deriveAccessMutation, isExemptRole } from './billingLogic.mjs';
```

```diff
 const applyAccessState = async (db, profile, { eventName, paidUntil, payload, customerIds }) => {
   const isManualPaused = String(profile?.access_status || '').toLowerCase() === 'paused_manual';
-  const autoPauseExempt = Boolean(profile?.auto_pause_exempt);
+  // phase30: автопауза не применяется к admin/applicant независимо от флага.
+  // Флаг auto_pause_exempt — для индивидуальных исключений (бартеры) среди платящих ролей.
+  const autoPauseExempt = Boolean(profile?.auto_pause_exempt) || isExemptRole(profile?.role);
```

```diff
-    // FEAT-015 Path C: пометить лог если профиль освобождён от автопаузы.
-    // is_processed=true (событие учтено в подписке), error_text — для аудита.
-    const skippedByExempt = Boolean(profile.auto_pause_exempt)
-      && (eventName === 'deactivation' || eventName === 'finish');
-    await markWebhookLogState(client, log.id, {
-      processed: true,
-      errorText: skippedByExempt ? 'SKIPPED_BY_AUTO_PAUSE_EXEMPT' : null
-    });
+    // FEAT-015 Path C: пометить лог если профиль освобождён от автопаузы.
+    // is_processed=true (событие учтено в подписке), error_text — для аудита.
+    // phase30: различаем skip по индивидуальному флагу vs по структурной роли.
+    const isPauseEvent = eventName === 'deactivation' || eventName === 'finish';
+    let skipReason = null;
+    if (isPauseEvent) {
+      if (isExemptRole(profile.role)) skipReason = 'SKIPPED_BY_ROLE';
+      else if (Boolean(profile.auto_pause_exempt)) skipReason = 'SKIPPED_BY_AUTO_PAUSE_EXEMPT';
+    }
+    await markWebhookLogState(client, log.id, {
+      processed: true,
+      errorText: skipReason
+    });
```

```diff
       update public.profiles
          set subscription_status = ...
              ...
-       where role <> 'admin'
+       where role not in ('admin', 'applicant')
          and coalesce(auto_pause_exempt, false) = false
          and coalesce(access_status, 'active') = 'active'
          and paid_until is not null
          and paid_until < now()
       returning id`
```

### `push-server/billingLogic.test.mjs` (+52)

5 новых тестов после старых 9:
1. **`isExemptRole: admin и applicant — true; intern/leader/mentor/неизвестные — false`** — матрица: 10 кейсов (admin/applicant lower+upper, intern/leader/mentor, '', null, undefined).
2. **`phase30 integration: admin role → deactivation НЕ паузит`** — симулирует то, что делает `applyAccessState`: `autoPauseExempt = exempt OR isExemptRole(role)`, проверяет что `m.access_status='active'`.
3. **`phase30 integration: applicant role → finish НЕ паузит`** — то же для applicant + finish event.
4. **`phase30 integration: intern role + НЕТ exempt → deactivation паузит`** — критический negative-кейс: платящая роль без флага должна паузиться нормально.
5. **`phase30 integration: leader role + индивидуальный exempt → deactivation НЕ паузит`** — кейс «бартер»: платящая роль, флаг выставлен через UI, защищён индивидуально.

### `views/AdminPanel.jsx` (+30 / −1)

**1. Подсказка над списком (после `return ( <div className="space-y-6">`):**

```diff
                     return (
                         <div className="space-y-6">
+                            <div className="surface-card p-4 md:p-5 bg-slate-50/60 border border-slate-200">
+                                <p className="text-sm text-slate-600 leading-relaxed">
+                                    Здесь только индивидуальные исключения (бартеры, постоянные льготы
+                                    для конкретных людей). Админы и абитуриенты защищены автоматически
+                                    по своей роли — их в этом списке быть не должно.
+                                </p>
+                            </div>
+
                             <div className="surface-card p-6 md:p-8">
                                 <div className="flex items-center gap-3 mb-4">
                                     <Shield size={22} className="text-emerald-600" strokeWidth={1.6} />
                                     <h3 className="font-display font-semibold text-slate-900">
                                         Всегда бесплатно ({forever.length})
                                     </h3>
                                 </div>
```

**2. IIFE в модалке: инфо-блок для admin/applicant вместо чекбокса/радио/textarea.**

```diff
-                {editingExemptUser && (
+                {editingExemptUser && (() => {
+                    // phase30: admin и applicant защищены структурно по роли в push-server.
+                    // Флаг auto_pause_exempt для них не имеет эффекта — показываем инфо вместо формы.
+                    const exemptByRole = ['admin', 'applicant'].includes(String(editingExemptUser.role || '').toLowerCase());
+                    if (exemptByRole) {
+                        return (
+                            <div className="space-y-5">
+                                <div className="p-4 rounded-2xl border border-emerald-200 bg-emerald-50/60">
+                                    <div className="flex items-start gap-3">
+                                        <Shield size={20} className="text-emerald-600 mt-0.5 flex-shrink-0" strokeWidth={1.8} />
+                                        <div className="min-w-0">
+                                            <div className="text-sm font-semibold text-slate-800">
+                                                Защищён автоматически по роли ({editingExemptUser.role})
+                                            </div>
+                                            <div className="text-xs text-slate-600 mt-1 leading-relaxed">
+                                                Webhook от Prodamus не паузит этого пользователя независимо
+                                                от флага. Флаг <code className="px-1 py-0.5 rounded bg-slate-100 text-slate-700">auto_pause_exempt</code>{' '}
+                                                для него не имеет эффекта. Если роль сменится на платящую
+                                                (intern / leader / mentor) — флаг автоматически сбросится.
+                                            </div>
+                                        </div>
+                                    </div>
+                                </div>
+                                <div className="flex gap-3 pt-2">
+                                    <Button variant="secondary" onClick={() => setEditingExemptUser(null)} className="flex-1">
+                                        Закрыть
+                                    </Button>
+                                </div>
+                            </div>
+                        );
+                    }
+                    return (
                     <div className="space-y-5">
                         <label className="flex items-start gap-3 p-4 rounded-2xl border border-slate-200 bg-slate-50/60 cursor-pointer hover:border-emerald-300 transition-all">
                             ...
                         </label>
                         {exemptForm.enabled && (
                             ...
                         )}
                         <div className="flex gap-3 pt-2">
                             <Button variant="secondary" ...>Отмена</Button>
                             <Button onClick={...}>Сохранить</Button>
                         </div>
                     </div>
-                )}
+                    );
+                })()}
             </ModalShell>
```

(Существующее тело модалки не менялось — только обёрнуто в IIFE с early-return для exemptByRole.)

---

## Renaming UI «Без автопаузы» → «Льготы» (по `_session/16b`)

Источник: `docs/_session/2026-05-16_16b_strategist_rename_lgoty.md`. Имена БД-колонок (`auto_pause_exempt*`) **НЕ меняем** — только UI-надписи. В коде/комментариях остаётся слово `exempt`.

| Где | Было | Стало |
|---|---|---|
| Tab label (line 756) | `Без автопаузы` | `Льготы` |
| Заголовок раздела (новый h2 над подсказкой) | — | `Льготы` |
| Подсказка под заголовком | «Здесь только индивидуальные исключения...» | «Индивидуальные исключения: бартеры, постоянные льготы для конкретных людей. Админы и абитуриенты защищены автоматически по роли — их в этом списке быть не должно.» |
| Карточка #1 заголовок | `Всегда бесплатно ({forever.length})` | `Постоянная льгота ({forever.length})` |
| Карточка #1 подзаголовок | «Профили, защищённые от автопаузы по неоплате бессрочно...» | «Бессрочная льгота: бартер, служебный аккаунт, постоянная скидка. Не требует регулярной ревизии — flag живёт пока админ не снимет.» |
| Карточка #2 заголовок | `Бесплатно до даты ({untilDate.length})` | `Льгота до даты ({untilDate.length})` |
| Карточка #2 подзаголовок | «...проверяй, чьи флаги истекают и нужно ли продлевать. Cron в push-server автоматически снимает флаг после даты.» | «...проверяй, чьи льготы истекают и нужно ли продлевать. Cron в push-server автоматически снимает льготу после даты.» |
| Title модалки (ModalShell) | `Иммунитет к автопаузе — {name}` | `Льгота — {name}` |
| Чекбокс label в модалке | `Не паузить автоматически` | `Дать льготу (не паузить автоматически)` |
| Notify success | `Иммунитет к автопаузе включён` / `Иммунитет снят` | `Льгота включена` / `Льгота снята` |
| Tooltip Shield-кнопки в Users (line 1285-1287) | `Не паузить автоматически (до X)` / `(всегда)` / `Настроить иммунитет к автопаузе` | `Льгота: до X` / `Льгота: всегда` / `Льготы нет` |
| Инфо-блок для admin/applicant — заголовок | `Защищён автоматически по роли (admin)` | `Льгота не требуется — защищён по роли (admin)` |
| Инфо-блок для admin/applicant — текст | «...Флаг `auto_pause_exempt` для него не имеет эффекта. Если роль сменится на платящую (intern / leader / mentor) — флаг автоматически сбросится.» | «...Индивидуальная льгота для него не имеет эффекта. Если роль сменится на платящую (intern / leader / mentor) — льгота автоматически сбросится.» (убрал упоминание технического имени `auto_pause_exempt` из user-facing UI) |
| 3 кода-комментария (`{/* FEAT-015 ... */}`) | ссылки на старые названия | актуализированы: `// FEAT-015 Path C / phase30 — модалка «Льгота» (auto_pause_exempt)` и т.п. |

**Verify:** `grep -nE "автопауз\|иммунитет\|Иммунитет\|Без авто\|Бесплатно до\|Всегда бесплатно\|Не паузить" views/AdminPanel.jsx` → 0 совпадений в user-facing коде. JSX-парсер esbuild — clean.

**Что НЕ переименовывали:**
- `auto_pause_exempt`, `auto_pause_exempt_until`, `auto_pause_exempt_note` — БД-колонки, технические. Не меняем по решению стратега.
- `setProfileAutoPauseExempt`, `isExemptRole`, `exemptForm`, `editingExemptUser`, `setEditingExemptUser`, `savingExempt` — JS-идентификаторы, технические. Не меняем (риск опечатки vs ноль ценности — пользователь их не видит).
- `SKIPPED_BY_AUTO_PAUSE_EXEMPT`, `SKIPPED_BY_ROLE` — audit-метки в `billing_webhook_logs.error_text`, не user-facing.
- Строки `[reconcile ...]` / `[billing-reconcile ...]` в server.mjs — не user-facing (журнал systemd).

---

## Что НЕ затронуто

- **`deriveAccessMutation`** в `billingLogic.mjs` — pure-функция остаётся pure, не знает про роли. Принципиально, чтобы её можно было независимо тестировать с разными значениями `autoPauseExempt`.
- **`runNightlyExpiryReconcile` step 1 (auto-expire exempt-until)** — не меняли. Логика «истёкший exempt-until → false» работает для любых ролей; admin/applicant exempt после phase30 будет false, поэтому никто из них туда не попадёт.
- **`services/dataService.js setProfileAutoPauseExempt`** — не меняли. Если Ольга через DevTools вызовет PATCH на admin'а — БД его примет (нет column-level constraint'а), но эффекта в коде не будет (role winning). Триггер на role-смену тоже не сработает (роль не меняется).
- **Frontend Shield-кнопка в основном списке Users** (line 1280-1289) — не меняли. Открывает модалку для всех. Для admin/applicant модалка теперь корректно показывает инфо-блок. Можно было бы скрыть/задизаблить кнопку для них, но это лишний UX-сигнал «вообще ничего не делать» — лучше дать модалку с объяснением.

---

## Edge-case'ы

1. **Что если роль в БД написана с большой буквы (`'Admin'`, `'Applicant'`)?** Helper `isExemptRole` case-insensitive (`String(role||'').toLowerCase()`). UI-чек тоже case-insensitive. Триггер sql — case-sensitive (`role IN ('admin', 'applicant')`). По текущим данным все роли lowercase, но если когда-нибудь придёт capitalized — БД не сработает в trigger, в коде сработает. Стоит добавить `LOWER(...)` в trigger? **Принципиально нет** — БД-инвариант `role IN ('абитуриент','стажер','ведущая',...)` уже валидирует whitelist (см. `utils/roles.js`); если в БД попадёт `'Admin'`, это уже баг данных, а не нашей миграции. Не закладываюсь.

2. **Что если через UI поставить флаг для applicant'а после миграции?** PATCH через `setProfileAutoPauseExempt` пройдёт (нет column-constraint), флаг будет `true` в БД. Эффекта не будет (`isExemptRole` ловит первым). Список «Без автопаузы» **отобразит** этого юзера (фильтр `u.auto_pause_exempt`). Не идеально, но безвредно.
   - Альтернатива: отфильтровать список на `!isExemptRole(role)`. Сделать?
   - **Решил оставить**: показ — это «в БД флаг стоит, но эффекта нет». Если Ольга случайно поставила — увидит и снимет.
   - Если за неделю-другую такие false-positive начнут появляться — добавлю фильтр.

3. **Что если триггер `reset_exempt_on_role_change` сработает, а после этого ОБЫЧНОЕ webhook payment_success прилетит?** Платёж пройдёт нормально (не зависит от exempt — exempt только про `deactivation/finish`). Триггер сбросил флаг — webhook увидит `auto_pause_exempt=false`, intern/leader/mentor — теперь платящий. Корректно.

4. **Что если роль меняется на `archive` или другую неперечисленную?** Триггер не сработает (`NEW.role NOT IN ('intern','leader','mentor')`). Флаг остаётся как был. Это чтобы не сбрасывать exempt при «архивных» переходах. Если потом захочется — добавим в IF.

---

## Apply-порядок

Стратег предложил два этапа:
1. **🟢 на phase30 миграцию → apply через SSH (psql под gen_user) → VERIFY: 0 exempt по всем ролям.**
2. **🟢 на код-changes → commit + push + rsync + restart push-server.**

Готов. Жду первое 🟢.

После apply'я миграции (этап 1):
```sql
SELECT role, count(*) FILTER (WHERE auto_pause_exempt) AS exempt
FROM public.profiles GROUP BY role ORDER BY role;
-- Ожидание после COMMIT:
--    role     | exempt
-- ------------+--------
--  admin      |   0
--  applicant  |   0
--  intern     |   0
--  leader     |   0
--  mentor     |   0
```

Trigger smoke (под BEGIN/ROLLBACK):
```sql
BEGIN;
UPDATE public.profiles SET auto_pause_exempt = true
  WHERE role = 'applicant' LIMIT 1
  RETURNING id, role, auto_pause_exempt;
-- допустим, id=<X>

UPDATE public.profiles SET role = 'intern' WHERE id = '<X>'
  RETURNING id, role, auto_pause_exempt, auto_pause_exempt_note;
-- Ожидание: auto_pause_exempt=false, note содержит 'auto-reset on role change to intern at ...'.

ROLLBACK;
```

После этапа 2 (commit + deploy):
```bash
$ git commit -m 'feat(push-server): FEAT-015 phase30 — role-based autopause exemption'
$ git push origin main
$ rsync -av --exclude=node_modules --exclude='*.test.mjs' --exclude='.env' --exclude='package-lock.json' \
    push-server/ root@5.129.251.56:/opt/push-server/
$ ssh root@5.129.251.56 'systemctl restart push-server.service && sleep 2 && systemctl is-active push-server.service'
```

И отдельный smoke для frontend (Phase C6 deploy через GH Actions):
- В админке Garden открыть вкладку «Без автопаузы» → должна быть подсказка «Здесь только индивидуальные исключения...» + два пустых списка.
- Открыть Shield-кнопку для admin'а или applicant'а → инфо-блок «Защищён по роли», без чекбокса.

---

## Предлагаемые commit messages

**Этап 2a** (push-server):
```
feat(push-server): FEAT-015 phase30 — role-based autopause exemption

phase30 (2026-05-16): admin и applicant защищены от автопаузы СТРУКТУРНО
по роли. Флаг auto_pause_exempt — для индивидуальных исключений среди
платящих ролей (intern/leader/mentor).

- billingLogic.mjs: helper isExemptRole(role) — case-insensitive проверка
  ['admin','applicant'].
- server.mjs applyAccessState: autoPauseExempt = exempt OR isExemptRole(role).
- server.mjs handleProdamusWebhook: различает SKIPPED_BY_ROLE vs
  SKIPPED_BY_AUTO_PAUSE_EXEMPT для аудита.
- server.mjs runNightlyExpiryReconcile: WHERE role NOT IN ('admin','applicant')
  (расширили с 'admin').
- billingLogic.test.mjs: 5 новых тестов (isExemptRole матрица + 4 integration).
  Все 25/25 push-server tests зелёные.

Требует apply phase30 миграции в БД (см. migrations/2026-05-16_phase30_exempt_role_cleanup.sql).

Diff: docs/_session/2026-05-16_17_codeexec_exempt_cleanup_diff.md
```

**Этап 2b** (frontend, отдельным коммитом):
```
feat(admin): FEAT-015 phase30 — Льготы UI + role-based защита

В админке Garden:
- Tab «Без автопаузы» переименован в «Льготы». Все надписи раздела
  обновлены под слово «льгота» (по решению Ольги). БД-колонки
  auto_pause_exempt* не переименовываются.
- Подсказка над списком: «Индивидуальные исключения: бартеры, постоянные
  льготы для конкретных людей. Админы и абитуриенты защищены автоматически
  по роли — их в этом списке быть не должно.»
- Карточки «Постоянная льгота» / «Льгота до даты» (вместо «Всегда
  бесплатно» / «Бесплатно до даты»).
- Модалка «Льгота — {имя}»: чекбокс «Дать льготу (не паузить
  автоматически)»; для admin/applicant вместо формы показывается
  инфо-блок «Льгота не требуется — защищён по роли» с кнопкой
  «Закрыть».
- Tooltip Shield-кнопки в Users: «Льгота: всегда» / «Льгота: до X» /
  «Льготы нет».
- Notify: «Льгота включена» / «Льгота снята».

Diff: docs/_session/2026-05-16_17_codeexec_exempt_cleanup_diff.md
```

(Можно одним коммитом с push-server'ом — на твоё усмотрение.)
