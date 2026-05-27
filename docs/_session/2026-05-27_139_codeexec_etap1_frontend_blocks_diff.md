# Сессия 3 Этапа 1 — Frontend блоки: diff-on-review

**От:** codeexec → стратегу через Ольгу
**Дата:** 2026-05-27
**Скоп:** §4.5 + §6 ТЗ [_134](2026-05-26_134_strategist_tz_etap1_training_feedback.md) — 3 новых компонента, 4 интеграции, bulk-export placeholder, **правки стратега 1+2** (терминология + ADMIN sidebar).
**Backend:** phase38 `d65969e` + phase39 `8d39853`
**Frontend backbone:** `786add4`
**Статус:** код подготовлен, **жду 🟢 на apply**.

---

## 1. TL;DR

- 3 новых файла в `components/`: `PvlTrainingFeedbackForm.jsx` (~85 LOC), `PvlTrainingFeedbackList.jsx` (~120 LOC), `PvlTrainingSessionBlock.jsx` (~170 LOC).
- 4 интеграции: `PvlPeerProfileView` (заменяю заглушку), `PvlMyCohortView` (сетка карточек + admin mode), `PvlMenteeCardView` (read-only блок для mentor+admin), `AdminPage` route `/admin/cohort` + sidebar item.
- Правки стратега 1+2: «Моя когорта» → «Участницы курса» (sidebar+заголовки+nav), + `/admin/cohort` route.
- Расширение `listMyCohortPeers` через embedded `profiles!inner(role)` чтобы admin видел только applicant'ов (отсекает phase37 интернов).
- Bulk-export placeholder в admin view.
- QaScreen assertion поправка: 14 → 15 admin items.
- ~700+ LOC всего.

---

## 2. Правки стратега (перед стартом)

### 2.1 Терминология «когорта» → «Участницы курса»

| Где | Было | Стало |
|---|---|---|
| `STUDENT_MENU_ICON` (PvlPrototypeApp l.509-516) | ключ `'Моя когорта': Users` | ключ `'Участницы курса': Users` |
| Sidebar student (l.610-619) | label `«Моя когорта»` + `setStudentSection('Моя когорта')` | label `«Участницы курса»` + `setStudentSection('Участницы курса')` |
| `PvlMyCohortView` заголовок | `«Менти моей когорты»` | `«Участницы курса»` |
| `PvlPeerProfileView` back-кнопка | `«← К списку когорты»` | `«← К списку участниц»` |
| Имена файлов/компонентов | `PvlMyCohortView`, `is_pvl_cohort_peer` | НЕ меняем (техническая нотация) |
| `setStudentSection` стрингу можно оставить как `'Участницы курса'` или `'cohort'` — UI label важнее. | | |

### 2.2 ADMIN sidebar item «Участницы курса»

- `ADMIN_SIDEBAR_CONFIG`: добавить `{ type: 'item', label: 'Участницы курса', path: '/admin/cohort' }` после `Менторы` (логическая группа «actors»).
- `ADMIN_MENU_ICON`: добавить `'Участницы курса': Users` (та же иконка что в STUDENT).
- `AdminPage`: + `if (adminPathOnly === '/admin/cohort') return <PvlMyCohortView selfStudentId={null} navigate={navigate} viewerRole="admin" />;`
- `adminSectionForRoute`: + `if (ap === '/admin/cohort') return 'Участницы курса';`
- `QaScreen` (l.7846): assertion `=== 14` → `=== 15` (counts admin items).
- `QA_ROUTE_LIST` (l.7733): + `/admin/cohort`.

### 2.3 MENTOR sidebar — НЕ трогаем (по ТЗ).

---

## 3. PvlTrainingFeedbackForm.jsx (~85 LOC) — НОВЫЙ

`components/PvlTrainingFeedbackForm.jsx`:

```jsx
import React, { useEffect, useState } from 'react';
import ModalShell from './ModalShell';
import { pvlPostgrestApi } from '../services/pvlPostgrestApi';

const MIN_WHAT_WORKED = 50;

export default function PvlTrainingFeedbackForm({
    isOpen,
    onClose,
    sessionId,
    authorId,
    existingFeedback = null, // если редактируем — берём текущие значения
    onSaved,
}) {
    const [whatWorked, setWhatWorked] = useState('');
    const [whatToStrengthen, setWhatToStrengthen] = useState('');
    const [oneTechnique, setOneTechnique] = useState('');
    const [openQuestion, setOpenQuestion] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);

    // Префилл при edit
    useEffect(() => {
        if (!isOpen) return;
        setWhatWorked(existingFeedback?.text_what_worked || '');
        setWhatToStrengthen(existingFeedback?.text_what_to_strengthen || '');
        setOneTechnique(existingFeedback?.text_one_technique || '');
        setOpenQuestion(existingFeedback?.text_open_question || '');
        setError(null);
    }, [isOpen, existingFeedback]);

    const valid = whatWorked.trim().length >= MIN_WHAT_WORKED;
    const isEdit = !!existingFeedback;

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!valid || saving) return;
        setSaving(true);
        setError(null);
        try {
            const row = await pvlPostgrestApi.upsertTrainingFeedback({
                session_id: sessionId,
                author_id: authorId,
                text_what_worked: whatWorked.trim(),
                text_what_to_strengthen: whatToStrengthen.trim(),
                text_one_technique: oneTechnique.trim(),
                text_open_question: openQuestion.trim(),
            });
            onSaved?.(row);
            onClose?.();
        } catch (e) {
            setError(String(e?.message || 'Не удалось сохранить отзыв'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <ModalShell
            isOpen={isOpen}
            onClose={onClose}
            title={isEdit ? 'Редактировать отзыв' : 'Оставить отзыв'}
            size="lg"
            footer={
                <div className="flex items-center justify-between gap-3">
                    <p className="text-xs text-[#7A6758]">
                        Дедлайн методички — 48 часов после встречи. Платформа форму не закрывает,
                        но лучше успеть пока в памяти.
                    </p>
                    <div className="flex gap-2">
                        <button type="button" onClick={onClose} className="text-sm text-[#7A6758] hover:text-[#4A3728] px-4 py-2">Отмена</button>
                        <button
                            type="submit"
                            form="pvl-training-feedback-form"
                            disabled={!valid || saving}
                            className="text-sm bg-[#4A3728] text-white rounded-full px-5 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {saving ? 'Сохраняем…' : (isEdit ? 'Сохранить изменения' : 'Отправить отзыв')}
                        </button>
                    </div>
                </div>
            }
        >
            <form id="pvl-training-feedback-form" onSubmit={handleSubmit} className="space-y-5">
                <Field label="Что в этой встрече сработало" required hint={`Минимум ${MIN_WHAT_WORKED} символов. Два-три конкретных момента.`}>
                    <textarea
                        value={whatWorked}
                        onChange={(e) => setWhatWorked(e.target.value)}
                        rows={4}
                        className="w-full rounded-xl border border-[#E8D5C4] bg-[#FAF6F2] px-3 py-2 text-sm text-[#4A3728]"
                        placeholder="Два-три конкретных момента."
                    />
                    <div className="text-[11px] text-[#7A6758] mt-1">{whatWorked.trim().length}/{MIN_WHAT_WORKED}</div>
                </Field>
                <Field label="Что можно усилить" hint="Безоценочно и конкретно. Если ничего — можно оставить пустым.">
                    <textarea value={whatToStrengthen} onChange={(e) => setWhatToStrengthen(e.target.value)} rows={3} className="w-full rounded-xl border border-[#E8D5C4] bg-[#FAF6F2] px-3 py-2 text-sm text-[#4A3728]" />
                </Field>
                <Field label="Один приём ведущей, который вы заметили и запомнили" hint="Короткое — одно предложение или название приёма.">
                    <textarea value={oneTechnique} onChange={(e) => setOneTechnique(e.target.value)} rows={2} className="w-full rounded-xl border border-[#E8D5C4] bg-[#FAF6F2] px-3 py-2 text-sm text-[#4A3728]" />
                </Field>
                <Field label="Вопрос, который у вас остался после встречи" hint="Опционально.">
                    <textarea value={openQuestion} onChange={(e) => setOpenQuestion(e.target.value)} rows={2} className="w-full rounded-xl border border-[#E8D5C4] bg-[#FAF6F2] px-3 py-2 text-sm text-[#4A3728]" />
                </Field>
                {error ? <p className="text-sm text-red-600">{error}</p> : null}
            </form>
        </ModalShell>
    );
}

function Field({ label, hint, required, children }) {
    return (
        <div>
            <label className="block text-sm font-medium text-[#4A3728] mb-1">
                {label}{required ? <span className="text-red-500"> *</span> : null}
            </label>
            {hint ? <p className="text-[11px] text-[#7A6758] mb-2">{hint}</p> : null}
            {children}
        </div>
    );
}
```

---

## 4. PvlTrainingFeedbackList.jsx (~120 LOC) — НОВЫЙ

`components/PvlTrainingFeedbackList.jsx`:

```jsx
import React, { useEffect, useState } from 'react';
import { pvlPostgrestApi } from '../services/pvlPostgrestApi';
import { pvlDomainApi } from '../services/pvlMockApi';
import { formatPvlDateTime } from '../utils/pvlDateFormat';
import PvlTrainingFeedbackForm from './PvlTrainingFeedbackForm';

function resolveAuthorName(authorId) {
    if (!authorId) return '';
    const u = pvlDomainApi.db.users.find((x) => String(x.id) === String(authorId));
    return String(u?.fullName || u?.name || u?.email || authorId).trim();
}

const FEEDBACK_RULES = [
    'Безоценочно — про факт, не про человека.',
    'Конкретно — пример, не обобщение.',
    'С опорой на то, что сработало.',
    'Без советов — формулируйте как вопрос или наблюдение.',
];

export default function PvlTrainingFeedbackList({
    sessionId,
    sessionStudentId,
    viewerId,
    viewerRole, // 'student' | 'mentor' | 'admin'
    canSeeAll, // computed выше: owner of session OR mentor of owner OR admin
}) {
    const [feedback, setFeedback] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showRules, setShowRules] = useState(false);
    const [showMine, setShowMine] = useState(false);
    const [formOpen, setFormOpen] = useState(false);
    const [editTarget, setEditTarget] = useState(null);

    const refresh = () => {
        setLoading(true);
        pvlPostgrestApi.listTrainingFeedback(sessionId)
            .then((rows) => setFeedback(Array.isArray(rows) ? rows : []))
            .catch(() => setFeedback([]))
            .finally(() => setLoading(false));
    };

    useEffect(() => { refresh(); }, [sessionId]);

    const myFeedback = feedback.find((f) => f.author_id === viewerId) || null;
    const others = feedback.filter((f) => f.author_id !== viewerId);
    const isPeerOnly = viewerRole === 'student' && sessionStudentId !== viewerId;

    return (
        <div className="mt-3 border-t border-[#E8D5C4] pt-3">
            <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-semibold text-[#4A3728]">Отзывы ({feedback.length})</h4>
                <button
                    type="button"
                    onClick={() => setShowRules((v) => !v)}
                    className="text-[11px] text-[#7A6758] hover:text-[#4A3728]"
                >
                    {showRules ? '−' : '+'} Правила обратной связи
                </button>
            </div>
            {showRules ? (
                <ul className="mb-3 text-[12px] text-[#7A6758] space-y-1 list-disc list-inside">
                    {FEEDBACK_RULES.map((r) => <li key={r}>{r}</li>)}
                </ul>
            ) : null}

            {loading ? <p className="text-xs text-[#7A6758]">Загружаем отзывы…</p> : null}

            {/* peer-only mode: collapsible «Мой отзыв» + кнопка оставить/редактировать */}
            {!loading && isPeerOnly ? (
                myFeedback ? (
                    <div>
                        <button type="button" onClick={() => setShowMine((v) => !v)} className="text-sm text-[#4A3728] underline-offset-2 hover:underline">
                            {showMine ? '▾' : '▸'} Мой отзыв
                        </button>
                        {showMine ? <FeedbackBody fb={myFeedback} /> : null}
                        <button
                            type="button"
                            onClick={() => { setEditTarget(myFeedback); setFormOpen(true); }}
                            className="mt-2 text-xs text-[#4A3728] underline"
                        >
                            Редактировать
                        </button>
                    </div>
                ) : (
                    <button
                        type="button"
                        onClick={() => { setEditTarget(null); setFormOpen(true); }}
                        className="text-sm bg-[#4A3728] text-white rounded-full px-4 py-1.5"
                    >
                        Оставить отзыв
                    </button>
                )
            ) : null}

            {/* owner / mentor / admin mode: разворачиваем всё с подписями */}
            {!loading && canSeeAll && feedback.length > 0 ? (
                <ul className="space-y-3">
                    {feedback.map((fb) => (
                        <li key={fb.id} className="rounded-xl bg-[#FAF6F2] border border-[#E8D5C4] p-3">
                            <div className="flex items-baseline justify-between gap-3">
                                <span className="text-sm font-medium text-[#4A3728]">{resolveAuthorName(fb.author_id)}</span>
                                <span className="text-[11px] text-[#7A6758]">{formatPvlDateTime(fb.created_at)}</span>
                            </div>
                            <FeedbackBody fb={fb} />
                        </li>
                    ))}
                </ul>
            ) : null}

            {!loading && canSeeAll && feedback.length === 0 ? (
                <p className="text-xs text-[#7A6758]">Отзывов пока нет.</p>
            ) : null}

            <PvlTrainingFeedbackForm
                isOpen={formOpen}
                onClose={() => setFormOpen(false)}
                sessionId={sessionId}
                authorId={viewerId}
                existingFeedback={editTarget}
                onSaved={() => refresh()}
            />
        </div>
    );
}

function FeedbackBody({ fb }) {
    return (
        <div className="mt-2 space-y-2 text-sm text-[#4A3728]">
            <FieldLine label="Что сработало" text={fb.text_what_worked} />
            <FieldLine label="Что можно усилить" text={fb.text_what_to_strengthen} />
            <FieldLine label="Приём ведущей" text={fb.text_one_technique} />
            <FieldLine label="Вопрос после встречи" text={fb.text_open_question} />
        </div>
    );
}

function FieldLine({ label, text }) {
    if (!text || !text.trim()) return null;
    return (
        <div>
            <div className="text-[11px] uppercase tracking-wide text-[#7A6758]">{label}</div>
            <div className="whitespace-pre-wrap">{text}</div>
        </div>
    );
}
```

---

## 5. PvlTrainingSessionBlock.jsx (~170 LOC) — НОВЫЙ

`components/PvlTrainingSessionBlock.jsx`:

```jsx
import React, { useEffect, useState } from 'react';
import { pvlPostgrestApi } from '../services/pvlPostgrestApi';
import { formatPvlDateTime } from '../utils/pvlDateFormat';
import ModalShell from './ModalShell';
import PvlTrainingFeedbackList from './PvlTrainingFeedbackList';

const SESSION_LIMIT = 2;

export default function PvlTrainingSessionBlock({
    studentId,
    viewerId,
    viewerRole, // 'student' | 'mentor' | 'admin'
    isMentorOfStudent = false, // вычисляется outside (PvlMenteeCardView знает)
}) {
    const [sessions, setSessions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [createOpen, setCreateOpen] = useState(false);
    const [toast, setToast] = useState(null);

    const refresh = () => {
        setLoading(true);
        pvlPostgrestApi.listTrainingSessions(studentId)
            .then((rows) => setSessions(Array.isArray(rows) ? rows : []))
            .catch((e) => setError(String(e?.message || 'load failed')))
            .finally(() => setLoading(false));
    };

    useEffect(() => { refresh(); }, [studentId]);

    const isOwnPage = String(viewerId) === String(studentId);
    const canCreate = isOwnPage && sessions.length < SESSION_LIMIT;
    const limitReached = isOwnPage && sessions.length >= SESSION_LIMIT;
    const canSeeAllFeedback = isOwnPage || isMentorOfStudent || viewerRole === 'admin';

    return (
        <section className="rounded-2xl bg-white border border-[#E8D5C4] shadow-sm p-5">
            <header className="flex items-center justify-between mb-4">
                <h3 className="font-display text-lg text-[#4A3728]">Тренировочные завтраки</h3>
                {canCreate ? (
                    <button
                        type="button"
                        onClick={() => setCreateOpen(true)}
                        className="text-sm bg-[#4A3728] text-white rounded-full px-4 py-1.5 hover:opacity-90"
                    >
                        Я провела тренировочный завтрак
                    </button>
                ) : null}
            </header>

            {limitReached ? (
                <p className="text-xs text-[#7A6758] mb-3">
                    Лимит {SESSION_LIMIT} достигнут. Чтобы добавить ещё — обратитесь к админу.
                </p>
            ) : null}

            {loading ? <p className="text-sm text-[#7A6758]">Загружаем сессии…</p> : null}
            {error ? <p className="text-sm text-red-600">Ошибка: {error}</p> : null}
            {!loading && !error && sessions.length === 0 ? (
                <p className="text-sm text-[#7A6758]">Тренировочных завтраков пока нет.</p>
            ) : null}

            <div className="space-y-4">
                {sessions.map((s) => (
                    <article key={s.id} className="rounded-xl border border-[#E8D5C4] bg-[#FAF6F2] p-4">
                        <div className="flex items-baseline justify-between gap-3">
                            <div className="text-sm font-medium text-[#4A3728]">{formatPvlDateTime(s.conducted_at)}</div>
                        </div>
                        <p className="mt-1 text-sm text-[#4A3728] whitespace-pre-wrap">{s.scenario_topic}</p>
                        <PvlTrainingFeedbackList
                            sessionId={s.id}
                            sessionStudentId={studentId}
                            viewerId={viewerId}
                            viewerRole={viewerRole}
                            canSeeAll={canSeeAllFeedback}
                        />
                    </article>
                ))}
            </div>

            <CreateSessionModal
                isOpen={createOpen}
                onClose={() => setCreateOpen(false)}
                studentId={studentId}
                onCreated={(row) => {
                    setSessions((prev) => [row, ...prev].sort((a, b) => (a.conducted_at < b.conducted_at ? 1 : -1)));
                    setCreateOpen(false);
                }}
                onLimitExceeded={(msg) => {
                    setToast(msg);
                    setCreateOpen(false);
                    setTimeout(() => setToast(null), 4000);
                }}
            />

            {toast ? (
                <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[100] bg-white text-[#4A3728] border border-[#E8D5C4] rounded-full px-5 py-2 shadow-md text-sm">
                    {toast}
                </div>
            ) : null}
        </section>
    );
}

function CreateSessionModal({ isOpen, onClose, studentId, onCreated, onLimitExceeded }) {
    const [conductedAt, setConductedAt] = useState(toLocalDateTimeValue(new Date()));
    const [topic, setTopic] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (isOpen) {
            setConductedAt(toLocalDateTimeValue(new Date()));
            setTopic('');
            setError(null);
        }
    }, [isOpen]);

    const valid = topic.trim().length >= 1;

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!valid || saving) return;
        setSaving(true);
        setError(null);
        try {
            const result = await pvlPostgrestApi.createTrainingSession({
                student_id: studentId,
                conducted_at: new Date(conductedAt).toISOString(),
                scenario_topic: topic.trim(),
            });
            if (result.limitExceeded) {
                onLimitExceeded?.(result.error || 'Лимит 2 достигнут');
                return;
            }
            if (result.row) {
                onCreated?.(result.row);
            }
        } catch (e) {
            setError(String(e?.message || 'Не удалось создать сессию'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <ModalShell
            isOpen={isOpen}
            onClose={onClose}
            title="Я провела тренировочный завтрак"
            size="md"
            footer={
                <div className="flex justify-end gap-2">
                    <button type="button" onClick={onClose} className="text-sm text-[#7A6758] px-4 py-2">Отмена</button>
                    <button
                        type="submit"
                        form="pvl-training-session-form"
                        disabled={!valid || saving}
                        className="text-sm bg-[#4A3728] text-white rounded-full px-5 py-2 disabled:opacity-50"
                    >
                        {saving ? 'Сохраняем…' : 'Сохранить'}
                    </button>
                </div>
            }
        >
            <form id="pvl-training-session-form" onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-[#4A3728] mb-1">Дата и время</label>
                    <input
                        type="datetime-local"
                        value={conductedAt}
                        onChange={(e) => setConductedAt(e.target.value)}
                        className="w-full rounded-xl border border-[#E8D5C4] bg-[#FAF6F2] px-3 py-2 text-sm text-[#4A3728]"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-[#4A3728] mb-1">Тема сценария встречи <span className="text-red-500">*</span></label>
                    <input
                        type="text"
                        value={topic}
                        onChange={(e) => setTopic(e.target.value)}
                        className="w-full rounded-xl border border-[#E8D5C4] bg-[#FAF6F2] px-3 py-2 text-sm text-[#4A3728]"
                        placeholder="Что обсуждали"
                    />
                </div>
                {error ? <p className="text-sm text-red-600">{error}</p> : null}
            </form>
        </ModalShell>
    );
}

function toLocalDateTimeValue(date) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
```

---

## 6. Интеграция: `views/PvlPeerProfileView.jsx`

Заменяю всю часть «Тренировочные завтраки» (counter заглушка) на `PvlTrainingSessionBlock`. Также нужно знать `viewerId` (auth.uid()) и `isMentorOfStudent`.

`viewerId` для student — текущий `studentId` пропа, для mentor — actingMentorId, для admin — admin's auth.uid (не используется кроме как «not owner»). Получу через новый prop `viewerId` (передам из PvlPrototypeApp routes).

```diff
-import React, { useEffect, useState } from 'react';
-import { pvlPostgrestApi } from '../services/pvlPostgrestApi';
+import React from 'react';
 import { pvlDomainApi } from '../services/pvlMockApi';
+import PvlTrainingSessionBlock from '../components/PvlTrainingSessionBlock';

 function resolvePeerDisplayName(peerId) { /* … */ }

-export default function PvlPeerProfileView({ peerId, navigate, viewerRole = 'student' }) {
-    const [sessions, setSessions] = useState([]);
-    /* … counter logic … */
+export default function PvlPeerProfileView({ peerId, navigate, viewerRole = 'student', viewerId, isMentorOfPeer = false }) {
     const peerName = resolvePeerDisplayName(peerId);
     return (
         <div className="space-y-4">
             <div className="rounded-2xl bg-white p-6 shadow-sm">
                 {viewerRole === 'student' ? (
                     <button
                         type="button"
                         onClick={() => navigate('/student/cohort')}
                         className="text-xs text-slate-500 hover:text-slate-800 mb-3"
                     >
-                        ← К списку когорты
+                        ← К списку участниц
                     </button>
                 ) : null}
                 <h2 className="font-display text-2xl text-slate-800">{peerName}</h2>
                 <div className="mt-2 inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
                     Поток 1
                 </div>
             </div>
-            {/* counter block — заменяется */}
+            <PvlTrainingSessionBlock
+                studentId={peerId}
+                viewerId={viewerId}
+                viewerRole={viewerRole}
+                isMentorOfStudent={isMentorOfPeer}
+            />
         </div>
     );
 }
```

В `PvlPrototypeApp.jsx` — передать новые prop'ы:
```js
// StudentPage
return <PvlPeerProfileView peerId={peerId} navigate={navigate} viewerRole="student" viewerId={studentId} />;
// MentorPage — нужен auth user id mentor'a
return <PvlPeerProfileView peerId={peerId} navigate={navigate} viewerRole="mentor" viewerId={mentorId} isMentorOfPeer={isMentorOfPeerFor(mentorId, peerId)} />;
// AdminPage — нужен admin auth uid
return <PvlPeerProfileView peerId={peerId} navigate={navigate} viewerRole="admin" viewerId={null} />;
```

Helper `isMentorOfPeerFor(mentorId, peerId)`: проверяем через `pvlDomainApi.db` mentor_links. Это уже есть в коде — реиспользую через `pvlDomainApi.db.studentProfiles.find(p => p.userId === peerId)?.mentorId === mentorId` или через `pvl_garden_mentor_links`. Сейчас это синхронный mock, поскольку реальный RLS-фильтр уже отсекает запросы — UI флаг для скрытия кнопок.

---

## 7. Интеграция: `views/PvlMyCohortView.jsx` — сетка карточек + admin mode

Полная переработка:

```jsx
import React, { useEffect, useState } from 'react';
import { pvlPostgrestApi } from '../services/pvlPostgrestApi';
import { pvlDomainApi } from '../services/pvlMockApi';

function resolveProfile(peerId) {
    return pvlDomainApi.db.users.find((u) => String(u.id) === String(peerId)) || null;
}

function resolveMentorName(peer) {
    if (!peer?.mentor_id) return null;
    const m = pvlDomainApi.db.users.find((u) => String(u.id) === String(peer.mentor_id));
    return m?.fullName || m?.name || null;
}

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
    }, []);

    if (loading) return <div className="rounded-2xl bg-white p-6 text-sm text-slate-500 shadow-sm">Загружаем…</div>;
    if (error) return <div className="rounded-2xl bg-white p-6 text-sm text-red-600 shadow-sm">Ошибка: {error}</div>;

    // Admin: видит всех applicant'ов (фильтр через embedded role в API)
    // Student: видит peer'ов своей когорты + own
    const visible = viewerRole === 'admin'
        ? peers.filter((p) => p.role === 'applicant' && p.id !== selfStudentId)
        : (function () {
              const me = peers.find((p) => p.id === selfStudentId);
              const cohortId = me?.cohort_id;
              if (!cohortId) return [];
              return peers.filter((p) => p.cohort_id === cohortId && p.id !== selfStudentId);
          })();

    const myCohortMissing = viewerRole === 'student' && !peers.find((p) => p.id === selfStudentId)?.cohort_id;

    return (
        <div className="rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="font-display text-xl text-[#4A3728] mb-1">Участницы курса</h2>
            <div className="text-xs text-[#7A6758] mb-4">Поток 1</div>

            {myCohortMissing ? (
                <p className="text-sm text-[#7A6758]">Когорта не назначена, обратитесь к админу.</p>
            ) : visible.length === 0 ? (
                <p className="text-sm text-[#7A6758]">Список пока пуст.</p>
            ) : (
                <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {visible.map((p) => {
                        const u = resolveProfile(p.id);
                        const mentorName = resolveMentorName(p);
                        const initials = String(p.full_name || u?.fullName || '??').split(' ').slice(0, 2).map((s) => s[0]).join('').toUpperCase();
                        return (
                            <li key={p.id}>
                                <button
                                    type="button"
                                    onClick={() => navigate(`/${viewerRole}/peer/${p.id}`)}
                                    className="text-left w-full rounded-2xl border border-[#E8D5C4] bg-[#FAF6F2] px-4 py-3 hover:bg-white"
                                >
                                    <div className="flex items-center gap-3">
                                        {u?.avatarUrl ? (
                                            <img src={u.avatarUrl} alt="" className="w-10 h-10 rounded-full object-cover" />
                                        ) : (
                                            <div className="w-10 h-10 rounded-full bg-[#E8D5C4] flex items-center justify-center text-sm text-[#4A3728] font-medium">{initials}</div>
                                        )}
                                        <div className="min-w-0 flex-1">
                                            <div className="text-sm font-medium text-[#4A3728] truncate">{p.full_name || u?.fullName || p.id}</div>
                                            <div className="text-[11px] text-[#7A6758] truncate">
                                                {mentorName ? `ментор: ${mentorName}` : 'без ментора'}
                                            </div>
                                        </div>
                                    </div>
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}
```

**Зависимость:** требует поля `role` в response listMyCohortPeers — см. §10.

---

## 8. Интеграция: `views/PvlMenteeCardView.jsx`

Внутри `renderMenteeCard` после `MentorMeetingsPanel` добавить блок (read-only для mentor + admin, с bulk-export placeholder для admin):

```diff
 return (
     <div className="space-y-3">
         <MenteeHeader ... />
         <MenteeHomeworkResultsList tasks={homeworkResults} onOpenTask={onOpenTask} />
         {meetings?.length ? <MentorMeetingsPanel meetings={meetings} /> : null}
+        <PvlTrainingSessionBlock
+            studentId={resolvedStudentId}
+            viewerId={viewerId}
+            viewerRole={linkMode === 'admin' ? 'admin' : 'mentor'}
+            isMentorOfStudent={linkMode === 'mentor'}
+        />
+        {linkMode === 'admin' ? (
+            <div className="rounded-2xl bg-[#FAF6F2] border border-[#E8D5C4] p-4 text-xs text-[#7A6758]">
+                Выгрузка отзывов (MD/ZIP) — скоро.
+            </div>
+        ) : null}
     </div>
 );
```

`viewerId` нужно прокинуть через PvlMenteeCardView prop (`mentorActorId` или admin id). Сейчас `mentorId` уже определяется внутри (`profileRow?.mentorId`) — но это id mentor'a, а нам нужен **auth.uid()** viewer'а. Передам отдельным prop`viewerId` из PvlPrototypeApp.

---

## 9. Интеграция: AdminPage `/admin/cohort` route

```diff
 if (/^\/admin\/students\/[^/]+$/.test(adminPathOnly)) { /* … */ }
 if (adminPathOnly.startsWith('/admin/peer/')) { /* … */ }
+if (adminPathOnly === '/admin/cohort') {
+    return <PvlMyCohortView selfStudentId={null} navigate={navigate} viewerRole="admin" />;
+}
 return <TeacherPvlHome navigate={navigate} />;
```

---

## 10. API правка: `listMyCohortPeers` — embedded role

Нужно для admin filter applicant'ов (отсечь phase37 интернов):

```diff
 async listMyCohortPeers() {
     return asArray(await request('pvl_students', {
-        params: { select: 'id,full_name,cohort_id,mentor_id', order: 'full_name.asc' },
+        params: {
+            select: 'id,full_name,cohort_id,mentor_id,profile:profiles!inner(role)',
+            order: 'full_name.asc',
+        },
-    }));
+    })).map((p) => ({
+        ...p,
+        role: p.profile?.role || null,
+    }));
 }
```

PostgREST embedded resource через `!inner` — гарантирует non-null join (у всех pvl_students есть profile по FK). Клиент flatten'ит `role` для удобства.

`select=id,full_name,cohort_id,mentor_id,profile:profiles!inner(role)` — это `:profiles` alias. PostgREST вернёт `{ id, full_name, cohort_id, mentor_id, profile: { role: 'applicant' } }`.

---

## 11. Правки в PvlPrototypeApp.jsx

### 11.1 Импорт `PvlTrainingSessionBlock` (для `PvlMenteeCardView` integration? — нет, импорт в самом view. Здесь только если admin/mentor sidebar logic)

Нет, PvlPrototypeApp не импортирует SessionBlock напрямую. Только views.

### 11.2 Sidebar student: переименование (§2.1)

```diff
-                <button
-                    type="button"
-                    key="cohort"
-                    onClick={() => {
-                        setStudentSection('Моя когорта');
-                        navigate('/student/cohort');
-                    }}
-                    className={pvlSidebarNavClass(routePath === '/student/cohort' || routePath.startsWith('/student/peer/'))}
-                >
-                    <MenuLabel iconMap={STUDENT_MENU_ICON} label="Моя когорта" />
-                </button>
+                <button
+                    type="button"
+                    key="cohort"
+                    onClick={() => {
+                        setStudentSection('Участницы курса');
+                        navigate('/student/cohort');
+                    }}
+                    className={pvlSidebarNavClass(routePath === '/student/cohort' || routePath.startsWith('/student/peer/'))}
+                >
+                    <MenuLabel iconMap={STUDENT_MENU_ICON} label="Участницы курса" />
+                </button>
```

### 11.3 STUDENT_MENU_ICON

```diff
 const STUDENT_MENU_ICON = {
     Дашборд: LayoutGrid,
-    'Моя когорта': Users,
+    'Участницы курса': Users,
     Настройки: Settings2,
     'Вернуться в сад': CornerUpLeft,
     ...COURSE_MENU_ICON,
 };
```

### 11.4 ADMIN_SIDEBAR_CONFIG + ADMIN_MENU_ICON + adminSectionForRoute

```diff
 const ADMIN_SIDEBAR_CONFIG = [
     { type: 'item', label: 'Дашборд', path: '/admin/pvl' },
     { type: 'item', label: 'Ученицы', path: '/admin/students' },
     { type: 'item', label: 'Менторы', path: '/admin/mentors' },
+    { type: 'item', label: 'Участницы курса', path: '/admin/cohort' },
     { type: 'item', label: 'Материалы курса', path: '/admin/content' },
     /* … */
 ];

 const ADMIN_MENU_ICON = {
     Дашборд: LayoutGrid,
     Ученицы: Users,
     Менторы: UserCog,
+    'Участницы курса': Users,
     'Материалы курса': Files,
     /* … */
 };

 function adminSectionForRoute(allowedRoute) {
     /* … */
+    if (ap === '/admin/cohort') return 'Участницы курса';
     /* … */
 }
```

### 11.5 QaScreen assertion

```diff
-const adminMenuOk = ADMIN_SIDEBAR_CONFIG.filter((x) => x.type === 'item').length === 14;
+const adminMenuOk = ADMIN_SIDEBAR_CONFIG.filter((x) => x.type === 'item').length === 15;
```

### 11.6 QA_ROUTE_LIST

```diff
 const QA_ROUTE_LIST = [
     /* … */
+    '/admin/cohort',
     /* … */
 ];
```

### 11.7 Маршруты — передать viewerId/isMentorOfPeer

`StudentPage` уже передаёт `viewerId={studentId}`. Для MentorPage и AdminPage передам отдельно с context'ом — `mentorId` для mentor, null для admin. И вычислять `isMentorOfPeer` через mock layer (sync).

В PvlPrototypeApp прокинуть в PvlPeerProfileView и PvlMenteeCardView дополнительный prop `viewerId`. Admin виewer'у можно не передавать (поведение idempotent — admin canSeeAll=true даже без owner match).

---

## 12. Smoke план

### 12.1 Build smoke
```
cd garden && npm run build
```
Ожидание: 2059+ modules, без TS/ESLint errors.

### 12.2 RLS smoke (мной через psql, как в Сессии 2)
```sql
-- 1. Под Ольгой Разжигаевой (peer) видит ли через is_pvl_cohort_peer
--    свои peer-row + 14 других? (own=1, peers=15)
SET ROLE authenticated; SET request.jwt.claim.sub = '90c9b7c7-…'; SELECT count(*) FROM pvl_students;

-- 2. Под Ольгой Разжигаевой — listMyCohortPeers с embedded role
--    должен вернуть только applicant'ов (16, без intern'ов).
SELECT count(*) FROM pvl_students WHERE EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = pvl_students.id AND p.role='applicant'
);

-- 3. Под admin — все applicant'ы (16) vs all (29).
```

### 12.3 UI smoke (Ольга в браузере)
По ТЗ §6 sequenced сценарии 1-7 — но без реальных авторизаций под applicant'ами невозможно. Минимальный smoke под Ольгой-admin:
- [ ] `/admin/cohort` — сетка из 16 карточек applicant'ов.
- [ ] `/admin/students/{Ирина-id}` — карточка menti + блок «Тренировочные завтраки» (0 сессий).
- [ ] `/admin/peer/{Ирина-id}` — peer profile + блок (0 сессий).
- [ ] Sidebar: «Участницы курса» в админском sidebar.
- [ ] Console — без errors.

Для admin-preview as Ирина — не уверен что dev-tools работают на проде. Если работают (см. `localStorage.pvl_dev_tools=1`) — Ольга может смокнуть real-user scenarios.

---

## 13. Известные ограничения / TODO

- `isMentorOfStudent` вычисляется через mock layer (`pvlDomainApi.db`). Это не RLS-источник правды, но UI-флаг (RLS уже отсекает запросы). Достаточно для текущей фазы.
- Bulk-export — placeholder без логики (Этап 1.5).
- `PvlMenteeCardView` для admin's mentee card берёт `mentor_id` через `pvl_garden_mentor_links` mock; для mentor'a-of-mentee match через те же links. Для admin view linkMode='admin' блок показывается всегда, `canSeeAll=true` всегда.
- `PvlMyCohortView` (admin mode) сетка может стать большой когда подключат Поток 2. Пагинация — не в скоп.
- `MentorPage` не имеет `/mentor/cohort` route — ТЗ §4.5 говорит «менторский sidebar не добавляем». Если ментор откроет `/mentor/peer/{id}` напрямую — будет работать.

---

## 14. Файловая сводка

| Файл | Действие | LOC |
|---|---|---|
| `components/PvlTrainingFeedbackForm.jsx` | A (новый) | ~85 |
| `components/PvlTrainingFeedbackList.jsx` | A (новый) | ~120 |
| `components/PvlTrainingSessionBlock.jsx` | A (новый) | ~170 |
| `services/pvlPostgrestApi.js` | M (embedded role в listMyCohortPeers) | +5 |
| `views/PvlPeerProfileView.jsx` | M (replace counter block) | -40/+15 |
| `views/PvlMyCohortView.jsx` | M (полный rewrite на сетку + admin mode) | -20/+75 |
| `views/PvlMenteeCardView.jsx` | M (+ SessionBlock + bulk placeholder) | +12 |
| `views/PvlPrototypeApp.jsx` | M (sidebar + adminSection + routes + QA) | +30/-5 |

Всего: ~640 LOC новых + ~80 правок существующих.

---

## 15. Запрос 🟢

Если ОК — стратег даёт 🟢, codeexec пишет код + smoke + ждёт отдельного 🟢 на commit. Push — отдельным 🟢 PUSH.

Если NOT OK — что править?
