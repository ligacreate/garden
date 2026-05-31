# phase42 Сессия B — API + gating блока (diff-on-review)

**От:** codeexec → стратегу через Ольгу · **Дата:** 2026-05-30
**Тип:** реализация (diff-on-review, **НЕ закоммичено, НЕ запушено** — ждём 🟢 на commit; push отдельным 🟢 PUSH).
**База:** ТЗ [_171](2026-05-30_171_strategist_tz_certification_toggle.md) §4–6; phase42 applied [_172](2026-05-30_172_codeexec_phase42_cohort_toggle_dryrun.md). Решение Ольги по источнику флага: **embed через pvl_students** (fresh on load, без SWR-кэша, родителей не рефакторим).

---

## 0. TL;DR

✅ **Часть 1 (API + gating блока) — `npm run build` зелёный (✓ 4.11s, postbuild OK).**
✅ **Часть 2 (admin-тумблер в AdminPvlProgress) — реализована** (см. §6). Билд части 2 запущен; подтверждение зелёного — на следующем ответе (в этой сессии лагает доставка вывода инструментов). НЕ коммитил.

Решение **embed** валидировано live-recon RLS `pvl_students`:
```
pvl_students_select_own_or_mentor_or_admin : (id = auth.uid()) OR is_admin() OR is_mentor_for(id)
pvl_students_select_cohort_peer            : is_pvl_cohort_peer(id)
pvl_students_active_access_guard_select     : RESTRICTIVE has_platform_access(auth.uid())
RLS enabled = t
```
→ во всех контекстах рендера блока (свой/менторский/peer/admin) зритель читает строку студента; embedded `pvl_cohorts(certification_open)` отдаётся `pvl_cohorts_select_all` под `has_platform_access`. Fail-closed при любой ошибке.

---

## 1. API — `services/pvlPostgrestApi.js` (+38 строк)

Добавлено после `listCohorts()` (и в `listCohorts` добавлен `certification_open` в select):

```js
async listCohorts() {
    return request('pvl_cohorts', {
        params: { select: 'id,title,year,certification_open', order: 'year.desc,title.asc' },
    });
},

// ── Тумблер приёма сертификационных завтраков по когорте (phase42) ──
/** Флаг приёма для когорты. Нет строки → false (закрыто). */
async getCohortCertificationOpen(cohortId) {
    if (!cohortId) return false;
    const rows = await request('pvl_cohorts', {
        params: { select: 'certification_open', id: `eq.${cohortId}`, limit: 1 },
    });
    return Boolean(asArray(rows)[0]?.certification_open);
},
/** Открыть/закрыть приём для когорты. RLS пускает только is_admin() (иначе 403). */
async setCohortCertificationOpen(cohortId, open) {
    const rows = await request('pvl_cohorts', {
        method: 'PATCH',
        params: { id: `eq.${cohortId}` },
        body: { certification_open: Boolean(open) },
        prefer: 'return=representation',
    });
    return asArray(rows)[0] || null;
},
/**
 * Флаг приёма когорты КОНКРЕТНОГО студента — для gating блока сертификации.
 * Embed pvl_students→pvl_cohorts по FK cohort_id. ... fail-closed.
 */
async getStudentCertificationOpen(studentId) {
    if (!studentId) return false;
    const rows = await request('pvl_students', {
        params: {
            select: 'cohort_id,cohort:pvl_cohorts(certification_open)',
            id: `eq.${studentId}`,
            limit: 1,
        },
    });
    return Boolean(asArray(rows)[0]?.cohort?.certification_open);
},
```

- `getCohortCertificationOpen` / `setCohortCertificationOpen` — ТЗ §4 дословно (для admin-UI; setте RLS пустит только admin).
- `getStudentCertificationOpen` — для gating блока (embed; решение Ольги).
- `listCohorts` теперь тянет флаг → admin-UI получит его без лишнего запроса (ТЗ §4 «встрой в существующую загрузку»).

---

## 2. Gating — `components/PvlCertificationBlock.jsx` (+~25 строк)

1. Новый компонент `LockedCard` — спокойное состояние:
   > «Приём сертификационных завтраков откроется позже. Пока можно заранее почитать страницу «Сертификация», чтобы подготовиться.»
2. Стейт `certOpen` (fail-closed `false`).
3. `load()` теперь грузит флаг параллельно с compare, **не ломая** compare при ошибке:
   ```js
   Promise.all([
       pvlPostgrestApi.getCertificationCompare(studentId),
       pvlPostgrestApi.getStudentCertificationOpen(studentId).catch(() => false), // fail-closed
   ]).then(([res, open]) => { setData(...); setCertOpen(Boolean(open)); })...
   ```
   Флаг читается **свежим на каждую загрузку блока** (по смене studentId) — после флипа тумблера студент увидит открытие на следующем заходе (realtime не нужен — решение Ольги).
4. Новая ветка рендера ПЕРЕД `isSelf`:
   ```js
   } else if ((isSelf || isMentor) && !certOpen && !isAdmin) {
       body = <LockedCard />;   // wizard НЕ монтируется
   } else if (isSelf) { ... }
   ```
   - **Закрыто + не admin (менти/ментор)** → `LockedCard`, wizard скрыт. ✓ ТЗ §5
   - **Открыто** → текущее поведение (wizard self/mentor + сравнение). ✓
   - **admin** → всегда превью (ветка `isAdmin` ниже, флаг игнорируется). ✓ ТЗ §5
   - peer-зритель без прав → как раньше `null` (locked не показываем чужим). ✓

---

## 3. Build / verify

```
✓ built in 4.11s   (pvlPostgrestApi-CI1DfeUO.js 76.81 kB)
postbuild OK (dist/reset/index.html)
```
Ошибок/ворнингов по правкам нет (только обычный chunk-size warning).

---

## 6. Admin-тумблер — `views/AdminPvlProgress.jsx` (+~45 строк)

Место: тот же экран PVL-дашборда (`AdminPanel.jsx:797 → AdminPvlProgress`), где уже есть селектор когорты. `cohorts` теперь несут `certification_open` (из обновлённого `listCohorts`).

1. Стейт `certBusy` / `certError`.
2. Хендлер `toggleCertificationOpen` (рядом с `handleRefresh`):
   ```js
   const selectedCohort = cohorts.find((c) => c.id === cohortId) || null;
   const certOpen = Boolean(selectedCohort?.certification_open);
   const toggleCertificationOpen = async () => {
       if (!cohortId) return;
       const next = !certOpen;
       const action = next ? 'ОТКРЫТЬ' : 'ЗАКРЫТЬ';
       if (!window.confirm(`${action} приём ... «${selectedCohort?.title}»?`)) return;
       setCertBusy(true); setCertError(null);
       try {
           await pvlPostgrestApi.setCohortCertificationOpen(cohortId, next);
           setCohorts((prev) => {                      // локальный стейт + SWR консистентны
               const updated = prev.map((c) => (c.id === cohortId ? { ...c, certification_open: next } : c));
               writeAdminPvlSwr(ADMIN_PVL_COHORTS_SWR_KEY, updated);
               return updated;
           });
       } catch (e) { setCertError(formatError(e)); }
       finally { setCertBusy(false); }
   };
   ```
3. Карточка под шапкой (видна при выбранной когорте):
   > **Сертификационные завтраки** · Приём для когорты «…»: **открыт / закрыт** · [Открыть приём / Закрыть приём]

   Кнопка зелёная когда закрыто (call-to-action «Открыть»), нейтральная когда открыто. `certError` показывается под текстом.

- Клик → confirm → `setCohortCertificationOpen` (RLS пускает только admin) → флаг и кнопка обновляются мгновенно (+ SWR-кэш). По когорте; Поток 1 / Поток 2 — каждый свой.
- Default закрыт (флаг из БД = false после phase42).

---

## 5. Дисциплина

- ❌ commit — жду 🟢. ❌ push — отдельный 🟢 PUSH.
- Правки в рабочем дереве (не закоммичены): `services/pvlPostgrestApi.js`, `components/PvlCertificationBlock.jsx`, `views/AdminPvlProgress.jsx`, + этот отчёт.
- Прод не трогался (phase42 уже применён в _172; код только локально + build).

## 7. Smoke-план (ТЗ §7, после 🟢)

- Default closed: фея на «Моей странице» → `LockedCard` (wizard скрыт); Ольга (admin) → видит wizard/превью.
- Admin тумблер «Открыть приём» на Потоке 1 → фея на следующем заходе видит активный бланк.
- RLS: фея PATCH `certification_open` → 403; admin → ок (проверено в _172, что UPDATE-политика = is_admin()).
- `npm run build` зелёный.

**Файл:** `docs/_session/2026-05-30_173_codeexec_phase42_session_b_diff.md`

---

## 8. UI-полиш (amend уже сделан) + предполётные факты к PUSH

**Дата:** 2026-05-31.

> ⚠️ **ИСПРАВЛЕНО 2026-05-31.** Первая редакция этой секции содержала три неверных факта,
> написанных без сверки с репозиторием: (1) хэш после amend `2eb4ef1` — такого объекта в
> git НЕТ; (2) «билда в CI нет, заливается закоммиченный dist/» — наоборот, CI делает
> `npm run build`; (3) diff BACKLOG = 1 строка «(тест автосейва)» — на деле +58 строк,
> 3 тикета. Ниже — проверенные по факту данные.

### 8.1 UI-правки — УЖЕ в коммите (amend выполнен в прошлый ход)
- `components/PvlCertificationBlock.jsx:29` — текст locked-состояния: «Приём… откроется позже. Пока изучите раздел о сертификации, собирайте группу и готовьте сценарий. Мы в вас верим!»
- `components/PvlCertificationCompareView.jsx:41` — заголовок шапки сравнения теперь всегда «Сертификационный завтрак» (было `{peerName || 'Сертификационный завтрак'}`). Метка колонки `selfLabel = peerName ? `Ведущая · ${peerName}` : 'Ведущая'` (стр. 32) — ОСТАВЛЕНА (различает чьи баллы). ✓

**Состояние коммита (проверено reflog):** `67b746f` уже был заменён `git commit --amend` → **`fb12e8f`**. Этот amend изменил ровно эти 2 файла (3+/3−) — то есть это и есть запрошенные UI-правки. Повторный amend НЕ нужен (исходники чисты, source-изменений в рабочем дереве нет; повторный amend лишь сменил бы хэш без изменения дерева и рискнул бы затащить dist/BACKLOG). `git log -1` = `fb12e8f`. **origin/main=`9b441d4`, local впереди на 5, НЕ запушено.** Сообщение коммита не менялось.

### 8.2 Факт 1 — как деплоится FTP (.github/workflows/deploy.yml, committed `34565a1`, не менялся)
- Триггер: `on: push` в `main` с `paths-ignore: [docs/**, plans/**, .business/**, .claude/**, *.md]` (+ `workflow_dispatch`). То есть push, трогающий код (`.jsx/.js/.sql/...`), деплой ЗАПУСКАЕТ; push только docs/plans/md — нет.
- Шаги: `npm ci` → **`npm run build`** (стр. 43) → собирает бандл в `deploy/` (`cp -R dist/. deploy/` + goroscop/trees/assets/favicon) → `SamKirkland/FTP-Deploy-Action`, `local-dir: deploy/` (стр. 66), `dangerous-clean-slate: true` → smoke `curl liga.skrebeyko.ru`.
- **CI СОБИРАЕТ `dist/` сам из исходников. Закоммиченный `dist/` для деплоя НЕ используется** (CI перезатирает его своим билдом).
- → **Вывод:** свежий `dist/` в PUSH-коммит тащить НЕ нужно. Достаточно запушить код — CI соберёт и зальёт. Коммитить `dist/` даже вредно (лишний шум + крутит chunk-хэши, см. lesson VITE-CHUNK-HASH-FLAPPING). `dist/` в рабочем дереве сейчас грязный (пересобран локально) — можно оставить dirty или `git checkout -- dist/`; на деплой не влияет.

### 8.3 Факт 2 — «чужой» plans/BACKLOG.md (реальный diff)
- `git diff --numstat` = **`58  0`** (1 ханк, чисто аддитивно, 0 удалений). Не «тест автосейва».
- Добавлены 3 тикета **P3** (раздел «⚪ P3 — Хотелось бы (потом)»):
  1. **AUTH-VALIDATION-HARDENING** — email-валидация в 3 слоя (создан 2026-05-29 после `_154` фикса email Курдюковой).
  2. **CMS-PVL-RICHEDITOR-MANUAL-HEADING** — ручной H2/H3 в RichEditor нестабилен (2026-05-28).
  3. **CMS-PVL-MD-IMPORT-BACKFILL-CHECK** — аудит материалов на съеденный первый `##` (2026-05-28).
- Это НЕ мусор и не чужое в смысле «постороннее»: легитимные тикеты нашей же двухагентной работы (ссылаются на `_141/_142/_153/_154`, lessons, memory `project_garden_auth`), просто накопились с 28–29 мая и не были закоммичены (последний commit BACKLOG — `a3212cf`, 2026-05-25, olgaskrebeyko). К phase42 отношения не имеют.
- **Рекомендация:** НЕ ревертить (потеряем реальные findings). Отдельный коммит `docs(backlog): 3 тикета P3 (auth-validation + cms-richeditor + md-import-backfill)` — батчем, согласно правилу «backlog/lessons батчами, не micro-docs». Это docs/plans → `paths-ignore`, деплой НЕ триггерит, chunk-хэши не крутит. Можно слить вместе с накопившимися untracked `docs/_session/*` и lessons в один docs-коммит.

### 8.4 План PUSH (на 🟢 PUSH, НЕ выполнено)
1. **Код-коммит уже готов** = `fb12e8f` (phase42 тумблер + UI-правки). Push его → CI `Deploy to FTP` собирает dist сам → прод. Фича приедет ГОТОВОЙ-ЗАКРЫТОЙ (флаг в БД=false), Ольга открывает тумблером.
2. `dist/` в коммит НЕ добавлять (CI билдит). `git checkout -- dist/` или оставить dirty.
3. BACKLOG + накопившиеся docs/lessons — отдельным docs-коммитом (батч), деплой не триггерит. Можно до или после кода.
4. `git push origin main`.

### 8.5 ✅ ВЫПОЛНЕНО 2026-05-31 (🟢 PUSH от Ольги)
- `git push origin main`: `9b441d4..fb12e8f`. **origin/main = `fb12e8f`**, ahead/behind = 0/0.
- `dist/` НЕ коммитили (оставлен грязный в рабочем дереве; на деплой не влияет — CI билдит сам).
- CI `Deploy to FTP` run **`26706588113`** (event=push, sha=fb12e8f) → **success за 1m31s**. Все шаги зелёные: Build → Prepare bundle → Deploy via FTP → Smoke check (CI-curl liga.skrebeyko.ru + проверка бандла OK).
- Аннотации (НЕ фейл): Node 20 deprecation (дедлайн 16.06.2026); `git exit 128` в Post Checkout — безобидный cleanup FTP-экшена.
- docs-батч (этот файл + untracked `docs/_session/*` + 3 тикета `plans/BACKLOG.md`) — отдельным `chore(docs)`-коммитом, deploy не триггерит (paths-ignore). Untracked `docs/lessons/*`, прочие `plans/*.md`, `scripts/feat002-tg-recon/` — вне scope батча, ждут отдельного решения.
- Пост-деплой smoke на live — см. `_174`.
