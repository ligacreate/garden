# Сессия 2 Этапа 1 — Frontend backbone: diff-on-review

**От:** codeexec → стратегу через Ольгу
**Дата:** 2026-05-27
**Скоп:** §4 ТЗ [_134](2026-05-26_134_strategist_tz_etap1_training_feedback.md) — 6 API-методов + 4 маршрута + sidebar item + 2 скелета views.
**Backend phase38:** commit `d65969e`, applied 2026-05-26.
**Статус:** код подготовлен, **жду 🟢 на apply**.

---

## 1. TL;DR

- 4 файла: 1 правка (`pvlPostgrestApi.js`), 1 правка (`PvlPrototypeApp.jsx`), 2 новых (`PvlMyCohortView.jsx`, `PvlPeerProfileView.jsx`). ~310 LOC суммарно.
- Все 6 API-методов из §4.4 + 4 маршрута из §4.3 + sidebar item «Моя когорта» (только для student) + скелеты views.
- **Найден backend-gap по pvl_students RLS** (§5) — не блокирует Сессию 2 (admin/mentor smoke работает), но для production-flow student'a нужен phase39. Не расширяю scope этой сессии, оставляю стратегу решить.

---

## 2. Recon-выкладки (что прочитано)

| Файл | Что нашёл |
|---|---|
| [services/pvlPostgrestApi.js](../../services/pvlPostgrestApi.js) | 740 строк. Паттерн: `request(table, { method, params, body, prefer })` → возвращает array. `prefer: 'resolution=merge-duplicates,return=representation'` для upsert. `params: { on_conflict: 'col1,col2' }` для UNIQUE. Образцы: `upsertStudentContentProgress` (l.600), `createHomeworkSubmission` (l.468). Closing `};` на l.740 — туда дописываю Section «Training breakfasts (phase 38)». |
| [views/PvlPrototypeApp.jsx](../../views/PvlPrototypeApp.jsx) | 8502 строк. Hand-rolled router: `route` state + `navigate(path)`. Top-level switch на l.8276 (`if route.startsWith('/admin/')` → AdminPage, /mentor/ → MentorPage, /student/ → StudentPage). Каждая Page-функция — ladder `if (route === ...)` returns. StudentPage l.3289-3442, MentorPage l.4026-4140, AdminPage l.7528-7697. Sidebar: l.588-630 student / 631-691 mentor / 693-728 admin. `COURSE_MENU_LABELS` (l.277-286) общий для трёх ролей, поэтому «Моя когорта» НЕ туда — добавлю отдельной статической кнопкой в `role==='student'` блок. |
| [services/pvlAppKernel.js](../../services/pvlAppKernel.js) | `canAccessRoute(role, route)` (l.23-29) проверяет ROUTE_ACCESS_MAP — student=`['/student/']`, mentor=`['/mentor/']`, admin=`['/admin/']`. Префиксы покрывают новые маршруты (`/student/cohort`, `/student/peer/:id`, `/mentor/peer/:id`, `/admin/peer/:id`) — править kernel НЕ нужно. |
| views/PvlMenteeCardView.jsx (s.794) | Пример отдельного view-файла, паттерн `import React, { useMemo, useState }` + `pvlDomainApi.db.users.find(...)` для имени актора. Использую как образец для `resolveActorDisplayName` в новых views. |

---

## 3. Файл 1 — `services/pvlPostgrestApi.js`

**Локация правки:** добавляется блок перед закрывающей `};` (текущая строка 740). Никаких других правок.

```diff
@@ -738,4 +738,89 @@
     async upsertFaqItem(row) {
         const rows = await request('pvl_faq_items', {
             method: 'POST',
             body: [row],
             prefer: 'resolution=merge-duplicates,return=representation',
         });
         return asArray(rows)[0] || null;
     },
+
+    // ── Training breakfasts (phase 38) ──────────────────────────────────────
+
+    /**
+     * Список peer-менти моей когорты. RLS на pvl_students пускает:
+     *   id=auth.uid() / is_admin() / is_mentor_for(id).
+     * Для applicant пока что RLS отдаёт только её own row (см. _137 §5).
+     * Backend phase39 (cohort_peer policy) выровняет это позже — фронт не
+     * меняется.
+     */
+    async listMyCohortPeers() {
+        return asArray(await request('pvl_students', {
+            params: { select: 'id,full_name,cohort_id,mentor_id', order: 'full_name.asc' },
+        }));
+    },
+
+    /** Сессии тренировочных завтраков менти (свежие сверху). */
+    async listTrainingSessions(studentId) {
+        if (!studentId) return [];
+        return asArray(await request('pvl_training_sessions', {
+            params: {
+                select: 'id,student_id,conducted_at,scenario_topic,created_at,updated_at',
+                student_id: `eq.${studentId}`,
+                order: 'conducted_at.desc',
+            },
+        }));
+    },
+
+    /**
+     * Создание сессии. Триггер enforce_pvl_training_sessions_limit при 3-й
+     * вставке возвращает 400 с русским сообщением «Лимит тренировочных
+     * завтраков превышен». Возвращаем результат с флагом limitExceeded,
+     * чтобы caller показал toast — distinguish от других 400.
+     */
+    async createTrainingSession({ student_id, conducted_at, scenario_topic }) {
+        try {
+            const rows = await request('pvl_training_sessions', {
+                method: 'POST',
+                body: [{ student_id, conducted_at, scenario_topic }],
+                prefer: 'return=representation',
+            });
+            return { row: asArray(rows)[0] || null, limitExceeded: false };
+        } catch (e) {
+            const msg = String(e?.message || '');
+            if (msg.includes('Лимит тренировочных завтраков')) {
+                return { row: null, limitExceeded: true, error: msg };
+            }
+            throw e;
+        }
+    },
+
+    /** Admin-only через RLS (pvl_training_sessions_delete_admin). */
+    async deleteTrainingSession(sessionId) {
+        if (!sessionId) return false;
+        await request('pvl_training_sessions', {
+            method: 'DELETE',
+            params: { id: `eq.${sessionId}` },
+        });
+        return true;
+    },
+
+    /** Отзывы на сессию. RLS режет невидимые: peer-автору только свой. */
+    async listTrainingFeedback(sessionId) {
+        if (!sessionId) return [];
+        return asArray(await request('pvl_training_feedback', {
+            params: {
+                select: 'id,session_id,author_id,text_what_worked,text_what_to_strengthen,text_one_technique,text_open_question,created_at,updated_at',
+                session_id: `eq.${sessionId}`,
+                order: 'created_at.desc',
+            },
+        }));
+    },
+
+    /** UPSERT через UNIQUE (session_id, author_id) — для edit без отдельного PATCH. */
+    async upsertTrainingFeedback(payload) {
+        const rows = await request('pvl_training_feedback', {
+            method: 'POST',
+            params: { on_conflict: 'session_id,author_id' },
+            body: [payload],
+            prefer: 'resolution=merge-duplicates,return=representation',
+        });
+        return asArray(rows)[0] || null;
+    },
 };
```

**LOC:** ~85 строк добавляется (включая JSDoc).

---

## 4. Файл 2 — `views/PvlPrototypeApp.jsx`

**5 точечных правок** в существующем файле:

### 4.1 Импорты новых view (после строки 33)

```diff
 import PvlMenteeCardView from './PvlMenteeCardView';
+import PvlMyCohortView from './PvlMyCohortView';
+import PvlPeerProfileView from './PvlPeerProfileView';
```

### 4.2 STUDENT_MENU_ICON: добавить иконку для «Моя когорта» (l.509)

```diff
 const STUDENT_MENU_ICON = {
     Дашборд: LayoutGrid,
+    'Моя когорта': Users,
     Настройки: Settings2,
     'Вернуться в сад': CornerUpLeft,
     ...COURSE_MENU_ICON,
 };
```

`Users` уже импортируется выше (используется в MENTOR_MENU_ICON и ADMIN_MENU_ICON).

### 4.3 Sidebar student: добавить кнопку «Моя когорта» (после COURSE_MENU_LABELS.map, перед divider)

В блоке `role === 'student'` (l.588-630). Кнопка идёт **после** курсного меню (COURSE_MENU_LABELS), **перед** старым divider+Настройки:

```diff
                 {COURSE_MENU_LABELS.map((item) => {
                     // ... existing
                 })}
+                <div className={pvlSidebarDividerClass} />
+                <button
+                    type="button"
+                    key="cohort"
+                    onClick={() => {
+                        setStudentSection('Моя когорта');
+                        navigate('/student/cohort');
+                    }}
+                    className={pvlSidebarNavClass(routePath === '/student/cohort' || routePath.startsWith('/student/peer/'))}
+                >
+                    <MenuLabel iconMap={STUDENT_MENU_ICON} label="Моя когорта" />
+                </button>
                 <div className={pvlSidebarDividerClass} />
                 <button
                     type="button"
                     onClick={() => {
                         setStudentSection('Настройки');
                         navigate('/student/settings');
                     }}
```

**Active state:** «Моя когорта» подсвечена и на `/student/cohort` и на `/student/peer/:id` (peer-страница это drilldown списка).

### 4.4 StudentPage: + 2 case (после строки `/student/messages`, l.3404)

```diff
     if (route === '/student/messages') return <StudentDirectMessages studentId={studentId} />;
+    if (route === '/student/cohort') return <PvlMyCohortView selfStudentId={studentId} navigate={navigate} viewerRole="student" />;
+    if (route.startsWith('/student/peer/')) {
+        const peerId = route.split('/')[3];
+        return <PvlPeerProfileView peerId={peerId} navigate={navigate} viewerRole="student" />;
+    }
     if (route === '/student/tracker') {
```

### 4.5 MentorPage: + 1 case (после `/mentor/mentee/:id` блока, l.4109)

```diff
     if (/^\/mentor\/mentee\/[^/]+$/.test(route)) {
         // existing return PvlMenteeCardView
     }
+    if (route.startsWith('/mentor/peer/')) {
+        const peerId = route.split('/')[3];
+        return <PvlPeerProfileView peerId={peerId} navigate={navigate} viewerRole="mentor" />;
+    }

     const mentorCourseNavigate = (r) => {
```

### 4.6 AdminPage: + 1 case (после `/admin/students/:id` блока, l.7694)

```diff
     if (/^\/admin\/students\/[^/]+$/.test(adminPathOnly)) {
         // existing return PvlMenteeCardView
     }
+    if (adminPathOnly.startsWith('/admin/peer/')) {
+        const peerId = adminPathOnly.split('/')[3];
+        return <PvlPeerProfileView peerId={peerId} navigate={navigate} viewerRole="admin" />;
+    }

     return <TeacherPvlHome navigate={navigate} />;
 }
```

**LOC:** ~25 строк добавляется (правки + новые блоки).

---

## 5. Файл 3 (новый) — `views/PvlMyCohortView.jsx`

```jsx
import React, { useEffect, useState } from 'react';
import { pvlPostgrestApi } from '../services/pvlPostgrestApi';

export default function PvlMyCohortView({ selfStudentId, navigate, viewerRole = 'student' }) {
    const [peers, setPeers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        pvlPostgrestApi.listMyCohortPeers()
            .then((rows) => {
                if (cancelled) return;
                setPeers(Array.isArray(rows) ? rows : []);
                setError(null);
            })
            .catch((e) => { if (!cancelled) setError(String(e?.message || 'load failed')); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [selfStudentId]);

    const myRow = peers.find((p) => p.id === selfStudentId);
    const myCohortId = myRow?.cohort_id || null;
    const peersOfCohort = myCohortId
        ? peers.filter((p) => p.cohort_id === myCohortId && p.id !== selfStudentId)
        : [];

    if (loading) return <div className="rounded-2xl bg-white p-6 text-sm text-slate-500 shadow-sm">Загружаем когорту…</div>;
    if (error) return <div className="rounded-2xl bg-white p-6 text-sm text-red-600 shadow-sm">Ошибка: {error}</div>;

    if (!myCohortId) {
        return (
            <div className="rounded-2xl bg-white p-6 shadow-sm">
                <h2 className="font-display text-xl text-slate-800 mb-2">Менти моей когорты</h2>
                <p className="text-sm text-slate-500">Когорта не назначена, обратитесь к админу.</p>
            </div>
        );
    }

    return (
        <div className="rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="font-display text-xl text-slate-800 mb-1">Менти моей когорты</h2>
            <div className="text-xs text-slate-400 mb-4">Поток 1</div>
            {peersOfCohort.length === 0 ? (
                <p className="text-sm text-slate-500">В когорте пока никого, кроме вас. (Backend phase39 откроет cohort-peer SELECT — см. _137 §6.)</p>
            ) : (
                <ul className="space-y-2">
                    {peersOfCohort.map((p) => (
                        <li key={p.id}>
                            <button
                                type="button"
                                onClick={() => navigate(`/student/peer/${p.id}`)}
                                className="text-left w-full rounded-xl px-3 py-2 text-sm text-slate-800 hover:bg-slate-50"
                            >
                                {p.full_name || p.id}
                            </button>
                        </li>
                    ))}
                </ul>
            )}
            <p className="mt-6 text-xs text-slate-400">Здесь будут карточки — стиль в Сессии 3.</p>
        </div>
    );
}
```

**LOC:** ~65 строк (комменты + handlers + jsx). Чуть больше, чем ТЗ заявил ~50, потому что добавил loading/error/empty states — без них фронт упадёт в null-pointer при первом fetch.

---

## 6. Файл 4 (новый) — `views/PvlPeerProfileView.jsx`

```jsx
import React, { useEffect, useState } from 'react';
import { pvlPostgrestApi } from '../services/pvlPostgrestApi';
import { pvlDomainApi } from '../services/pvlMockApi';

function resolvePeerDisplayName(peerId) {
    if (!peerId) return '';
    const u = pvlDomainApi.db.users.find((x) => String(x.id) === String(peerId));
    return String(u?.fullName || u?.name || u?.email || peerId).trim();
}

export default function PvlPeerProfileView({ peerId, navigate, viewerRole = 'student' }) {
    const [sessions, setSessions] = useState([]);
    const [feedbackCounts, setFeedbackCounts] = useState({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        pvlPostgrestApi.listTrainingSessions(peerId)
            .then(async (rows) => {
                if (cancelled) return;
                setSessions(Array.isArray(rows) ? rows : []);
                const counts = {};
                for (const s of rows || []) {
                    // eslint-disable-next-line no-await-in-loop
                    const fb = await pvlPostgrestApi.listTrainingFeedback(s.id);
                    counts[s.id] = (fb || []).length;
                }
                if (!cancelled) setFeedbackCounts(counts);
                setError(null);
            })
            .catch((e) => { if (!cancelled) setError(String(e?.message || 'load failed')); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [peerId]);

    const peerName = resolvePeerDisplayName(peerId);
    const totalFeedback = Object.values(feedbackCounts).reduce((a, b) => a + b, 0);

    return (
        <div className="space-y-4">
            <div className="rounded-2xl bg-white p-6 shadow-sm">
                {viewerRole === 'student' ? (
                    <button
                        type="button"
                        onClick={() => navigate('/student/cohort')}
                        className="text-xs text-slate-500 hover:text-slate-800 mb-3"
                    >
                        ← К списку когорты
                    </button>
                ) : null}
                <h2 className="font-display text-2xl text-slate-800">{peerName}</h2>
                <div className="mt-2 inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
                    Поток 1
                </div>
            </div>

            <div className="rounded-2xl bg-white p-6 shadow-sm">
                <h3 className="font-display text-lg text-slate-800 mb-2">Тренировочные завтраки</h3>
                {loading ? (
                    <p className="text-sm text-slate-500">Загружаем сессии…</p>
                ) : error ? (
                    <p className="text-sm text-red-600">Ошибка: {error}</p>
                ) : (
                    <p className="text-sm text-slate-600">
                        {sessions.length} {sessions.length === 1 ? 'сессия' : 'сессий'},
                        {' '}{totalFeedback} {totalFeedback === 1 ? 'отзыв' : 'отзывов'}
                    </p>
                )}
                <p className="mt-4 text-xs text-slate-400">
                    Здесь будут тренировочные завтраки и отзывы — наполнение в Сессии 3.
                </p>
            </div>
        </div>
    );
}
```

**LOC:** ~80 строк. Включает loading/error/empty states.

**Note про N+1 в useEffect:** последовательный `for ... await listTrainingFeedback(s.id)` — это N+1 запрос. Для скелета приемлемо (Сессия 3 уберёт счётчики в пользу полного списка). Если нужно сразу batched — могу сделать одним запросом `?session_id=in.(...)` — отметьте.

---

## 7. Известный backend-gap (НЕ блокирует Сессию 2)

Проверил RLS `pvl_students` (политики на проде):

```
pvl_students_select_own_or_mentor_or_admin
  USING (id = auth.uid() OR is_admin() OR is_mentor_for(id))
```

**Нет cohort_peer-политики на pvl_students.** Это значит:

- `listMyCohortPeers()` под applicant вернёт **только её own row** (id=auth.uid()).
- Список «Менти моей когорты» для student'a пока что будет пустой.
- Admin / mentor — работают полностью.

ТЗ §4.4 говорил «RLS вернёт автоматически только своих peer'ов» — это про backend, которого пока нет.

**Предлагаю фронт оставить как есть** (peer-страница уже работает для admin/mentor smoke), а отдельным тикетом сделать **phase39**:

```sql
CREATE POLICY pvl_students_select_cohort_peer
  ON pvl_students FOR SELECT TO authenticated
  USING (is_pvl_cohort_peer(id));
```

Это маленькая чистая миграция, может уйти параллельно с Сессией 3 (когда student-flow начнёт реально использоваться).

В скелете `PvlMyCohortView` ясно прописал «В когорте пока никого… Backend phase39 откроет cohort-peer SELECT».

---

## 8. План smoke (после apply)

```bash
# 1. Build (без вёрстки в браузере на этом этапе — главное чтобы Vite собрал)
cd garden && npm run build 2>&1 | tail -20
#   expected: build success, без TypeScript / ESLint errors

# 2. Dev server + ручной smoke
npm run dev &
# Открыть http://localhost:5173
# Залогиниться под Ольгой admin (skrebeyko@…)
# 2.1. Перейти на /admin/peer/35019374-d7de-4900-aa9d-1797bcca9769 (Ирина Петруня)
#       → ожидание: страница не падает, «Ирина Петруня» в шапке,
#         «0 сессий, 0 отзывов» (таблицы пустые после Сессии 1).
# 2.2. DevTools Network → GET pvl_training_sessions?student_id=eq.{Ирина}
#       → 200 OK, [] (empty)
# 2.3. /admin/peer/<random uuid> → не падает, имя = uuid fallback
# 2.4. Console: 0 warnings / errors (особенно про useEffect deps)
# 2.5. Sidebar «Моя когорта» — только в student-режиме, не у админа/ментора
```

Smoke под student/mentor — затрудняется в local dev, потому что Garden auth требует реальной сессии. Сделаю под admin (через прод JWT) — этого достаточно для проверки рендера новых компонентов. Реальный flow «студент → создал сессию → пир оставил отзыв» — Сессия 3.

---

## 9. Что НЕ сделано в этой сессии (намеренно, по ТЗ §5)

- `PvlTrainingSessionBlock` / `PvlTrainingFeedbackList` / `PvlTrainingFeedbackForm` — Сессия 3.
- Расширение `/mentor/mentee/:id` блоком тренировочных — Сессия 3.
- Расширение `/admin/students/:id` блоком тренировочных — Сессия 3.
- Стиль / polish (цвета, аватары, badges) — Сессия 3.
- Backend phase39 cohort_peer policy для pvl_students — отдельный тикет.

---

## 10. Acceptance этой сессии

| Цель | Где сделано |
|---|---|
| 6 API-методов | §3 |
| 4 маршрута | §4.4-4.6 |
| Sidebar item «Моя когорта» (только student) | §4.3 |
| Скелет PvlMyCohortView | §5 |
| Скелет PvlPeerProfileView | §6 |
| Build проходит | §8.1 (после apply проверю) |
| Smoke под admin | §8.2 |
| Backend phase38 не трогается | да (миграция применена в Сессии 1) |

---

## 11. Запрос 🟢

Если ОК — стратег даёт 🟢, codeexec пишет код в 4 файла + smoke + ждёт отдельного 🟢 на commit.

Если NOT OK — что править: правки в маршрутах / API / скелетах / отметке про phase39?
