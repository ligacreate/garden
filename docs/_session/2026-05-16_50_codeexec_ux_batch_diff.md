# UX-батч: diff на ревью (3 фикса в одном заходе)

**От:** codeexec (VS Code)
**Кому:** Ольга → стратегу (claude.ai)
**Дата:** 2026-05-17
**В ответ на:** [49_strategist_ux_batch.md](2026-05-16_49_strategist_ux_batch.md)
**Статус:** ⏳ жду 🟢, после — apply / commit / push.

---

## Сводка рекогносцировки

- **Баг 1.** `grep "нужна проверка"` дал три места: `PvlPrototypeApp.jsx:3569` (источник), `PvlPrototypeApp.jsx:3606` (цвет pill), `AdminPvlProgress.jsx` (read-only лейбл с бэка, своя логика — НЕ трогаем). Мобильной зеркальной версии MentorMenteesGardenGrid нет. → **fix in place**, без выноса в utils.
- **Баг 2.** `dataService.RemoteApiService.updateMeeting` (строки 1970–2050) — там же `toIntOrNull(cleaned.income)`. Форма закрытия итогов — `MeetingsView.jsx` строки 1559–1597 (общая для «закрыть» и «редактировать»). Admin totals — `AdminPanel.jsx:60–73`. SQL запрос на null-income Ольга прогонит вручную перед apply (см. ниже).
- **Баг 3.** Корневые обёртки обоих табов (`MeetingsTab` строка 230, `MasteryTab` строка 350) сидят внутри одного контейнера `MeetingsView.jsx:1158` (`flex-1 min-h-0 overflow-y-auto pb-4 px-4 lg:px-0`) и весь экран ограничен `UserApp.jsx:989` (`max-w-6xl mx-auto` = 1152px). Явного `max-w-*` на MasteryTab НЕТ. Гипотеза: корневой div MasteryTab `<div className="animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">` не имеет `w-full`, и из-за анимации `slide-in-from-bottom-4` (transform) может временно или постоянно не растягиваться на 100% ширины. У MeetingsTab корневой div — `grid`, который растягивается автоматически.

---

## Баг 1 — PVL: split «нужна проверка» и «ждём доработку»

### Что делаем

В `MentorMenteesGardenGrid` рендерится один pill с текстом `row.stateLine`. Меняем подход: добавляем массив `row.stateLabels` (с текстом + цветом), рендерим несколько pillов. `row.stateLine` оставляем (используется в строке 3679 для подавления дубля «Просрочки»).

Лейблы со счётчиками — по запросу связного («у студентки могут быть оба статуса одновременно»):
- `нужна проверка (N)` — амбер (как сейчас)
- `ждём доработку (N)` — оранжевый (как «есть доработки» в `menteeStatusSurface`)

### Diff — `views/PvlPrototypeApp.jsx`

**Замена строк 3567–3570 (вычисление stateLine):**

```diff
-        let stateLine = 'в ритме';
-        if (overdueN > 0) stateLine = 'есть долги';
-        else if (pendingReview > 0 || inRevision > 0) stateLine = 'нужна проверка';
-        else if (notStartedHw > 0) stateLine = 'ДЗ не начаты';
+        let stateLine = 'в ритме';
+        const stateLabels = [];
+        if (overdueN > 0) {
+            stateLine = 'есть долги';
+            stateLabels.push({ key: 'overdue', text: 'есть долги', tone: 'есть долги' });
+        } else if (pendingReview > 0 || inRevision > 0) {
+            // split: ментор должен видеть, что именно от него ждут vs что ждём от студентки
+            stateLine = pendingReview > 0 ? 'нужна проверка' : 'ждём доработку';
+            if (pendingReview > 0) {
+                stateLabels.push({ key: 'review', text: `нужна проверка (${pendingReview})`, tone: 'нужна проверка' });
+            }
+            if (inRevision > 0) {
+                stateLabels.push({ key: 'revision', text: `ждём доработку (${inRevision})`, tone: 'есть доработки' });
+            }
+        } else if (notStartedHw > 0) {
+            stateLine = 'ДЗ не начаты';
+            stateLabels.push({ key: 'notstarted', text: 'ДЗ не начаты', tone: 'ДЗ не начаты' });
+        } else {
+            stateLabels.push({ key: 'rhythm', text: 'в ритме', tone: 'в ритме' });
+        }
```

**Добавить `stateLabels` в return-объект (после строки 3589):**

```diff
             notStartedHw,
+            stateLabels,
             coursePoints: pts.coursePointsTotal ?? 0,
```

**Замена pill-рендера (строки 3690–3696):**

```diff
-                        <div className="text-[10px] text-slate-500 pt-1.5 mt-auto flex flex-wrap items-center gap-1.5">
-                            <span
-                                className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${menteeStatusSurface(row.stateLine)}`}
-                            >
-                                {row.stateLine}
-                            </span>
-                        </div>
+                        <div className="text-[10px] text-slate-500 pt-1.5 mt-auto flex flex-wrap items-center gap-1.5">
+                            {(row.stateLabels && row.stateLabels.length > 0 ? row.stateLabels : [{ key: 'fallback', text: row.stateLine, tone: row.stateLine }]).map((lbl) => (
+                                <span
+                                    key={lbl.key}
+                                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${menteeStatusSurface(lbl.tone)}`}
+                                >
+                                    {lbl.text}
+                                </span>
+                            ))}
+                        </div>
```

`menteeStatusSurface('есть доработки')` уже существует (строка 3607) — оранжевый цвет.

**Условие «Просрочки:» в 3679 не трогаем** — `row.stateLine === 'есть долги'` остаётся валидным (см. ветку overdueN > 0 выше).

---

## Баг 2 — meetings income required + бэкфилл

### Шаги в нужном порядке

1. **SQL pre-flight (Ольга, перед apply кода):**
   ```sql
   SELECT count(*) FROM meetings WHERE status='completed' AND income IS NULL;
   ```
2. **Миграция-бэкфилл** (apply ДО фронт-валидации) — идемпотентная, безопасная даже при count=0.
3. **Core invariant в `dataService.RemoteApiService.updateMeeting`** — throw, если `status='completed'` и `income == null`.
4. **UX-required в форме** `MeetingsView.jsx` (handleSaveResult) — pre-submit check, понятная ошибка пользователю.
5. **AdminPanel.jsx** — счётчик «по N из M встреч» под Общим доходом.

### 2a — Миграция

Файл: `migrations/2026-05-17_phase33_meetings_income_backfill.sql`

```sql
-- migrations/2026-05-17_phase33_meetings_income_backfill.sql
--
-- UX-batch — бэкфилл income=0 для исторических completed-встреч.
--
-- Контекст:
--   До этой миграции поле `income` у встреч было опциональным. Ведущие
--   часто закрывали встречу, не вписав сумму (в т.ч. сама Ольга на
--   «Серендипности» 2026-05-16: cost='2000 рублей', 25 гостей, income=0
--   → ~50k руб. потеряны для статистики admin-дашборда).
--
--   Этой миграцией мы вводим required income на закрытии встречи (см.
--   parallel-изменения в MeetingsView.jsx и dataService.js). Старые
--   completed-встречи с income=NULL надо подровнять под "историческое
--   значение по умолчанию", иначе при следующем редактировании ведущая
--   увидит пустое поле и не сможет сохранить из-за required-валидации.
--
--   ВАЖНО: эти нули — НЕ "встреча была бесплатной", это "доход неизвестен
--   и потерян, проставлено задним числом". Если в будущих отчётах надо
--   будет отделить "реально бесплатная" vs "не заполнено" — придётся
--   восстанавливать по дате (всё, что апдейтнуто этой миграцией = до
--   2026-05-17 = "не заполнено"). Сейчас отдельным флагом не размечаем
--   ради простоты; если понадобится — добавим колонку `income_inferred`.
--
-- Поведение:
--   - Идемпотентно (повторный запуск ничего не сделает).
--   - Не трогает встречи где income УЖЕ установлен (включая явный 0).
--   - Не трогает встречи в статусах планировки/отмены — только completed.
--   - Транзакционно: или всё, или ничего.

BEGIN;

-- Pre-apply диагностика: сколько встреч задело
DO $$
DECLARE
    affected_count integer;
BEGIN
    SELECT count(*) INTO affected_count
    FROM meetings
    WHERE status = 'completed' AND income IS NULL;

    RAISE NOTICE 'phase33 backfill: % completed meetings with NULL income will be set to 0', affected_count;
END $$;

UPDATE meetings
SET income = 0
WHERE status = 'completed' AND income IS NULL;

COMMIT;
```

### 2b — `services/dataService.js` (core invariant)

**В `RemoteApiService.updateMeeting` (после `_sanitizeFields`, до сборки `sanitized`) — добавить в районе строки 1980:**

```diff
         const cleaned = this._sanitizeFields(rest, {
             plain: ['title', 'description', 'keep_notes', 'change_notes', 'fail_reason', 'cost', 'address', 'city', 'city_key', 'payment_link', 'meeting_format', 'online_visibility']
         });
+
+        // Core invariant: при закрытии встречи доход обязателен.
+        // Бесплатная встреча = явный 0. Это нужно для чистой статистики
+        // (см. миграцию 2026-05-17_phase33). Парная UX-проверка в
+        // MeetingsView.handleSaveResult — defense in depth, не дубль.
+        if (cleaned.status === 'completed') {
+            const incomeRaw = cleaned.income;
+            const incomeMissing = incomeRaw === null || incomeRaw === undefined || incomeRaw === '';
+            if (incomeMissing) {
+                throw new Error('Укажите доход (0 если встреча была бесплатной)');
+            }
+        }
+
         // Sanitize fields
         const durationValue = toIntOrNull(cleaned.duration);
```

**Аналогичный invariant добавить в `LocalStorageService.updateMeeting` (строки 732–748)** — на всякий случай, если `useLocalDb=true` (dev-режим):

```diff
     async updateMeeting(meeting) {
         const allMeetings = JSON.parse(localStorage.getItem('garden_meetings')) || [];
         const index = allMeetings.findIndex(m => m.id === meeting.id);
         if (index !== -1) {
             const sanitized = this._sanitizeFields(meeting, {
                 plain: ['title', 'description', 'keep_notes', 'change_notes', 'fail_reason', 'cost', 'address', 'city', 'payment_link']
             });
+            if (sanitized.status === 'completed') {
+                const incomeRaw = sanitized.income;
+                const incomeMissing = incomeRaw === null || incomeRaw === undefined || incomeRaw === '';
+                if (incomeMissing) {
+                    throw new Error('Укажите доход (0 если встреча была бесплатной)');
+                }
+            }
             allMeetings[index] = {
                 ...allMeetings[index],
                 ...sanitized,
```

### 2c — `views/MeetingsView.jsx` (UX required)

По заметке связного: **required только при переходе scheduled→completed**, не при редактировании уже-completed (после миграции у всех старых income=0, фрустрации не будет).

**Замена `handleSaveResult` (строки 926–949):**

```diff
     const handleSaveResult = async () => {
         if (isSaving) return;
+        // Required income только при первом закрытии встречи (scheduled→completed).
+        // При редактировании уже-completed встречи поле можно очистить/изменить.
+        const isFirstClosing = selectedMeeting?.status !== 'completed';
+        if (isFirstClosing) {
+            const incomeRaw = formData.income;
+            const incomeMissing = incomeRaw === null || incomeRaw === undefined || String(incomeRaw).trim() === '';
+            if (incomeMissing) {
+                onNotify('Укажите доход (0 если встреча была бесплатной)');
+                return;
+            }
+        }
         setIsSaving(true);
         try {
             await onUpdateMeeting({
                 ...formData,
                 status: 'completed'
             });
```

**Замена поля Input income в форме (строка 1572) — добавляем визуальный сигнал required + подсказку:**

```diff
-                    <Input type="number" label="Доход (₽)" value={formData.income} onChange={e => setFormData({ ...formData, income: e.target.value })} />
+                    <Input
+                        type="number"
+                        label={selectedMeeting?.status === 'completed' ? 'Доход (₽)' : 'Доход (₽) *'}
+                        placeholder="0 если бесплатная"
+                        value={formData.income}
+                        onChange={e => setFormData({ ...formData, income: e.target.value })}
+                    />
```

### 2d — `views/AdminPanel.jsx` (счётчик «по N из M»)

**Добавить вычисление в районе строк 68–73:**

```diff
     const totalMeetings = filteredMeetings.length;
     const totalGuests = filteredMeetings.reduce((acc, m) => acc + (parseInt(m.guests) || 0) + (parseInt(m.new_guests) || 0), 0);
     const totalIncome = filteredMeetings.reduce((acc, m) => {
         const val = parseInt((m.income || '0').toString().replace(/\D/g, '')) || 0;
         return acc + val;
     }, 0);
+    const meetingsWithIncome = filteredMeetings.filter(m => {
+        const raw = m.income;
+        return raw !== null && raw !== undefined && raw !== '';
+    }).length;
```

**Замена карточки «Общий доход» (строки 163–169):**

```diff
                 <div className="surface-card p-6 relative overflow-hidden group">
                     <div className="absolute top-0 right-0 p-4 text-slate-100 group-hover:scale-110 transition-transform"><BarChart size={64} /></div>
                     <div className="relative z-10">
                         <div className="text-slate-400 text-sm font-medium mb-1">Общий доход (rub)</div>
                         <div className="text-4xl font-bold text-slate-800 tracking-tight">{totalIncome.toLocaleString()}</div>
+                        {totalMeetings > 0 && (
+                            <div className="text-xs text-slate-400 mt-1">по {meetingsWithIncome} из {totalMeetings} встреч</div>
+                        )}
                     </div>
                 </div>
```

---

## Баг 3 — ширина «Мастерство» vs «Календарь»

### Анализ без скриншотов

Корневые контейнеры обоих табов сидят в одной обёртке (`MeetingsView.jsx:1158`) и ограничены `max-w-6xl` снаружи. Явного `max-w-*` в `MasteryTab` НЕТ (граната истории/намеренного сужения — отсутствует, можно править).

Гипотеза: корневой div `MasteryTab` (строка 350) `<div className="animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">` — обычный block, и потому теоретически растягивается. Но из-за `transform` в `slide-in-from-bottom-4` могло что-то ползти; либо ширина выглядит уже визуально из-за внутреннего layout (header `xl:grid-cols-[minmax(0,1fr)_220px]` + content `grid-cols-3` с sticky-левой колонкой).

### Минимальный conservative фикс

**Замена в `MasteryTab` (строка 350):**

```diff
-        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
+        <div className="w-full animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
```

Это безопасно: explicit `w-full` гарантирует растяжение на родительский контейнер. Никакие отступы / behaviour не ломаются.

**⚠️ Если после deploy визуально разница останется** — Ольга, пришли скриншоты Календарь vs Мастерство (DevTools → Elements → щёлкни на корневом div каждого, скрин с подсвеченным box). Тогда увижу реальное место ограничения и поправлю прицельно. Сейчас без визуала — стрелять «на ощупь».

---

## Чек-лист для apply (после 🟢)

- [ ] **Ольга:** прогнать SQL `SELECT count(*) FROM meetings WHERE status='completed' AND income IS NULL;` через psql, доложить число (для лога).
- [ ] **Ольга или я:** apply миграции `2026-05-17_phase33_meetings_income_backfill.sql` (psql / стандартный flow).
- [ ] **Я:** применить правки в PvlPrototypeApp.jsx, MeetingsView.jsx, dataService.js, AdminPanel.jsx.
- [ ] **Я:** один коммит со всем UX-батчем (3 фикса + 1 миграция) + `_session/` доки.
- [ ] **Я:** push, GH Actions деплоит фронт.
- [ ] **Ольга:** smoke в браузере:
  - PVL ментор-дашборд: студентка с pendingReview+inRevision показывает оба pill со счётчиками.
  - Закрытие планируемой встречи без income — модалка/ошибка «укажите доход».
  - Закрытие планируемой встречи с income=0 — сохраняется ОК.
  - Admin дашборд: «по N из M встреч» появилось.
  - Встречи → Мастерство визуально совпадает по ширине с Календарь (или скрин в _session, если нет).

---

## Открытые вопросы стратегу/Ольге

1. **Баг 1, лейбл «в ритме»:** сейчас он показывался только если все три счётчика =0. Сохраняю это поведение. ОК?
2. **Баг 2, миграция:** делаю unconditional `UPDATE` (идемпотентно). Альтернатива — отдельная колонка `income_inferred boolean`, чтобы в будущем отделить "историческое 0" от "реальная бесплатная". Сейчас НЕ добавляю (yagni). Если в репортах это понадобится — фиксим отдельной миграцией. ОК?
3. **Баг 2, форма Input с `*`:** добавил визуальный астериск в label. Если есть стандарт для required-полей в проекте (звёздочка / красный underline / `aria-required`) — подскажите, поправлю.
4. **Баг 3:** если `w-full` не решит — нужны скриншоты с DevTools-выделением.

Жду 🟢 или комменты.
