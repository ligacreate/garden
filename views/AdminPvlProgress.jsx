import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ArrowUp, ArrowDown, AlertCircle, RefreshCw, FileText, Download, Loader2, ChevronDown } from 'lucide-react';
import Button from '../components/Button';
import { pvlPostgrestApi } from '../services/pvlPostgrestApi';
import { api } from '../services/dataService';
import {
    buildStudentMarkdownReport,
    downloadAsMarkdownFile,
    downloadAsZipFile,
    safeFileName,
    todayIso,
    groupBySubmissionId,
    defaultStudentFilename,
    buildWeeksById,
    buildLessonsById,
    effectiveModuleNumber,
} from '../utils/pvlHomeworkReport';

const STATE_LINE_TONE = {
    'в ритме':         'bg-emerald-50 text-emerald-700 border-emerald-200',
    'нужна проверка':  'bg-blue-50 text-blue-700 border-blue-200',
    'есть долги':      'bg-rose-50 text-rose-700 border-rose-200',
    'ДЗ не начаты':    'bg-slate-100 text-slate-500 border-slate-200',
};

const STATE_LINE_OPTIONS = ['в ритме', 'нужна проверка', 'есть долги', 'ДЗ не начаты'];

const COLUMNS = [
    { key: 'full_name',      label: 'ФИО',         align: 'left'  },
    { key: 'mentor_name',    label: 'Ментор',      align: 'left'  },
    { key: 'hw_total',       label: 'Всего ДЗ',    align: 'right' },
    { key: 'hw_accepted',    label: 'Принято',     align: 'right' },
    { key: 'hw_in_review',   label: 'На проверке', align: 'right' },
    { key: 'hw_revision',    label: 'На доработке',align: 'right' },
    { key: 'hw_not_started', label: 'Не начато',   align: 'right' },
    { key: 'hw_overdue',     label: 'Просрочено',  align: 'right' },
    { key: 'last_activity',  label: 'Активность',  align: 'right' },
    { key: 'state_line',     label: 'Состояние',   align: 'left'  },
    { key: '__actions',      label: '',            align: 'right', sortable: false },
];

const SESSION_KEY_COHORT = 'adminPvlCohortId';

function compareRows(a, b, key) {
    const va = a[key];
    const vb = b[key];
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    if (typeof va === 'number' && typeof vb === 'number') return va - vb;
    return String(va).localeCompare(String(vb), 'ru');
}

function buildTotals(rows) {
    const counts = rows.reduce((acc, r) => {
        acc[r.state_line] = (acc[r.state_line] || 0) + 1;
        return acc;
    }, {});
    return { total: rows.length, counts };
}

function formatError(err) {
    if (err?.code === 'POSTGREST_JWT_MISCONFIG') return 'Сервер: PostgREST JWT misconfig.';
    const msg = String(err?.message || '');
    if (msg.includes('forbidden') || msg.includes('admin role required'))
        return 'Доступ только для администратора.';
    return msg || 'Не удалось загрузить данные.';
}

function formatActivity(value) {
    if (!value) return '—';
    try {
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) return '—';
        return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch { return '—'; }
}

function GroupProgressBar({ totals, cohortLabel }) {
    const { total, counts } = totals;
    if (total === 0) return null;
    const segments = [
        { key: 'в ритме',         color: 'bg-emerald-400', label: 'в ритме' },
        { key: 'нужна проверка',  color: 'bg-blue-400',    label: 'нужна проверка' },
        { key: 'есть долги',      color: 'bg-rose-400',    label: 'есть долги' },
        { key: 'ДЗ не начаты',    color: 'bg-slate-300',   label: 'не начаты' },
    ];
    return (
        <div className="space-y-2">
            <div className="text-sm text-slate-600">
                {cohortLabel && (
                    <>
                        <span className="font-medium text-slate-800">{cohortLabel}</span>
                        {' · '}
                    </>
                )}
                <span>{total} студенток</span>
            </div>
            <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100 ring-1 ring-slate-200">
                {segments.map((seg) => {
                    const n = counts[seg.key] || 0;
                    if (n === 0) return null;
                    const pct = (n / total) * 100;
                    return (
                        <div
                            key={seg.key}
                            className={seg.color}
                            style={{ width: `${pct}%` }}
                            title={`${seg.label}: ${n}`}
                        />
                    );
                })}
            </div>
            <div className="flex flex-wrap gap-3 text-xs text-slate-500">
                {segments.map((seg) => {
                    const n = counts[seg.key] || 0;
                    if (n === 0) return null;
                    return (
                        <span key={seg.key} className="inline-flex items-center gap-1.5">
                            <span className={`inline-block h-2 w-2 rounded-full ${seg.color}`} />
                            {seg.label} ({n})
                        </span>
                    );
                })}
            </div>
        </div>
    );
}

function useOutsideClick(ref, onOutside) {
    useEffect(() => {
        function handle(e) {
            if (ref.current && !ref.current.contains(e.target)) onOutside();
        }
        document.addEventListener('mousedown', handle);
        return () => document.removeEventListener('mousedown', handle);
    }, [ref, onOutside]);
}

function ReportDownloadButton({
    student,
    cohortTitle,
    homeworkItems,
    contentItems,
    weeks,
    lessons,
    mentorsById,
    onError,
}) {
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const popRef = useRef(null);
    useOutsideClick(popRef, () => setOpen(false));

    const modules = useMemo(() => {
        const weeksById = buildWeeksById(weeks);
        const lessonsById = buildLessonsById(lessons);
        const contentItemsById = new Map((contentItems || []).map((ci) => [String(ci.id), ci]));
        const set = new Set();
        for (const hi of homeworkItems || []) {
            if (!hi) continue;
            if (hi.item_type && hi.item_type !== 'homework') continue;
            if (hi.is_control_point) continue;
            const m = effectiveModuleNumber(hi, weeksById, lessonsById, contentItemsById);
            if (m != null) set.add(Number(m));
        }
        return [...set].sort((a, b) => a - b);
    }, [homeworkItems, weeks, lessons, contentItems]);

    const handlePick = async (moduleFilter) => {
        if (loading) return;
        setLoading(true);
        try {
            const submissions = await pvlPostgrestApi.listStudentHomeworkSubmissions(student.student_id);
            const submissionIds = submissions.map((s) => s.id).filter(Boolean);
            const history = await pvlPostgrestApi.listHomeworkStatusHistoryBulk(submissionIds);
            const historyByS = groupBySubmissionId(history);
            const md = buildStudentMarkdownReport({
                student,
                mentorName: student.mentor_name,
                cohortTitle,
                moduleNumber: moduleFilter,
                homeworkItems,
                submissions,
                statusHistoryBySubmission: historyByS,
                contentItems,
                weeks,
                lessons,
                mentorsById,
            });
            const moduleSlug = moduleFilter === 'all' ? 'все_модули' : `Модуль_${moduleFilter}`;
            const filename = `${safeFileName(student.full_name)}_${moduleSlug}_${todayIso()}.md`;
            downloadAsMarkdownFile(filename, md);
        } catch (err) {
            onError?.(err);
        } finally {
            setLoading(false);
            setOpen(false);
        }
    };

    return (
        <div className="relative inline-block" ref={popRef}>
            <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                disabled={loading}
                title="Скачать отчёт"
                className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors disabled:opacity-50"
            >
                {loading
                    ? <Loader2 size={16} className="animate-spin" />
                    : <FileText size={16} />}
            </button>
            {open && (
                <div className="absolute right-0 top-full mt-1 z-20 bg-white border border-slate-200 rounded-xl shadow-lg py-1 min-w-[160px]">
                    {modules.length === 0 && (
                        <div className="px-3 py-2 text-xs text-slate-400">Модули не подгрузились</div>
                    )}
                    {modules.map((m) => (
                        <button
                            key={m}
                            type="button"
                            onClick={() => handlePick(m)}
                            className="block w-full text-left px-3 py-2 hover:bg-slate-50 text-sm text-slate-700"
                        >
                            Модуль {m}
                        </button>
                    ))}
                    {modules.length > 0 && <div className="border-t border-slate-100 my-1" />}
                    <button
                        type="button"
                        onClick={() => handlePick('all')}
                        className="block w-full text-left px-3 py-2 hover:bg-slate-50 text-sm text-slate-700"
                    >
                        Все модули
                    </button>
                </div>
            )}
        </div>
    );
}

function BulkExportButton({
    visibleStudents,
    cohortTitle,
    homeworkItems,
    contentItems,
    weeks,
    lessons,
    mentorsById,
    onError,
}) {
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [progress, setProgress] = useState(0);
    const popRef = useRef(null);
    useOutsideClick(popRef, () => { if (!loading) setOpen(false); });

    const modules = useMemo(() => {
        const weeksById = buildWeeksById(weeks);
        const lessonsById = buildLessonsById(lessons);
        const contentItemsById = new Map((contentItems || []).map((ci) => [String(ci.id), ci]));
        const set = new Set();
        for (const hi of homeworkItems || []) {
            if (!hi) continue;
            if (hi.item_type && hi.item_type !== 'homework') continue;
            if (hi.is_control_point) continue;
            const m = effectiveModuleNumber(hi, weeksById, lessonsById, contentItemsById);
            if (m != null) set.add(Number(m));
        }
        return [...set].sort((a, b) => a - b);
    }, [homeworkItems, weeks, lessons, contentItems]);

    const total = visibleStudents?.length || 0;

    const handleBulk = async (moduleFilter) => {
        if (loading || total === 0) return;
        setOpen(false);
        setLoading(true);
        setProgress(0);
        try {
            const submissionsByStudent = [];
            for (let i = 0; i < visibleStudents.length; i += 1) {
                const s = visibleStudents[i];
                // eslint-disable-next-line no-await-in-loop
                const subs = await pvlPostgrestApi.listStudentHomeworkSubmissions(s.student_id);
                submissionsByStudent.push(subs);
                setProgress(i + 1);
            }
            const allSubmissionIds = submissionsByStudent.flat().map((s) => s.id).filter(Boolean);
            const history = await pvlPostgrestApi.listHomeworkStatusHistoryBulk(allSubmissionIds);
            const historyByS = groupBySubmissionId(history);

            const files = new Map();
            visibleStudents.forEach((student, idx) => {
                const md = buildStudentMarkdownReport({
                    student,
                    mentorName: student.mentor_name,
                    cohortTitle,
                    moduleNumber: moduleFilter,
                    homeworkItems,
                    submissions: submissionsByStudent[idx] || [],
                    statusHistoryBySubmission: historyByS,
                    contentItems,
                    weeks,
                    lessons,
                    mentorsById,
                });
                files.set(defaultStudentFilename({ student, moduleNumber: moduleFilter }), md);
            });

            const cohortSlug = safeFileName(cohortTitle || 'Когорта');
            const moduleSlug = moduleFilter === 'all' ? 'все_модули' : `Модуль_${moduleFilter}`;
            const zipName = `${cohortSlug}_${moduleSlug}_${todayIso()}.zip`;
            await downloadAsZipFile(zipName, files);
        } catch (err) {
            onError?.(err);
        } finally {
            setLoading(false);
            setProgress(0);
        }
    };

    const disabled = total === 0;

    return (
        <div className="relative inline-block" ref={popRef}>
            <Button
                variant="ghost"
                onClick={() => setOpen((o) => !o)}
                disabled={loading || disabled}
                className="!py-2 !px-3 text-sm border border-slate-200 hover:border-blue-200 hover:text-blue-700"
                title={total === 0 ? 'Нет видимых студенток' : 'Скачать ZIP-архив за модуль'}
            >
                {loading
                    ? <span className="inline-flex items-center gap-2"><Loader2 size={14} className="animate-spin" />Готовлю архив… {progress}/{total}</span>
                    : <span className="inline-flex items-center gap-2"><Download size={14} />Скачать архив за модуль…<ChevronDown size={14} /></span>}
            </Button>
            {open && !loading && (
                <div className="absolute right-0 top-full mt-1 z-20 bg-white border border-slate-200 rounded-xl shadow-lg py-1 min-w-[200px]">
                    {modules.length === 0 && (
                        <div className="px-3 py-2 text-xs text-slate-400">Модули не подгрузились (см. console)</div>
                    )}
                    {modules.map((m) => (
                        <button
                            key={m}
                            type="button"
                            onClick={() => handleBulk(m)}
                            className="block w-full text-left px-3 py-2 hover:bg-slate-50 text-sm text-slate-700"
                        >
                            Модуль {m}
                        </button>
                    ))}
                    {modules.length > 0 && <div className="border-t border-slate-100 my-1" />}
                    <button
                        type="button"
                        onClick={() => handleBulk('all')}
                        className="block w-full text-left px-3 py-2 hover:bg-slate-50 text-sm text-slate-700"
                    >
                        Все модули
                    </button>
                </div>
            )}
        </div>
    );
}

export default function AdminPvlProgress({ hiddenIds = [] }) {
    const [cohorts, setCohorts] = useState([]);
    const [cohortId, setCohortIdState] = useState(() => sessionStorage.getItem(SESSION_KEY_COHORT) || null);
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const [cohortsLoading, setCohortsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [sort, setSort] = useState({ key: 'full_name', dir: 'asc' });
    const [stateFilter, setStateFilter] = useState('all');
    const [refreshCounter, setRefreshCounter] = useState(0);
    const [homeworkItems, setHomeworkItems] = useState([]);
    const [contentItems, setContentItems] = useState([]);
    const [weeks, setWeeks] = useState([]);
    const [lessons, setLessons] = useState([]);
    const [mentorsById, setMentorsById] = useState(null);
    const [reportError, setReportError] = useState(null);

    const setCohortId = (id) => {
        setCohortIdState(id);
        if (id) sessionStorage.setItem(SESSION_KEY_COHORT, id);
        else sessionStorage.removeItem(SESSION_KEY_COHORT);
    };

    useEffect(() => {
        let cancelled = false;
        setCohortsLoading(true);
        pvlPostgrestApi.listCohorts()
            .then((list) => {
                if (cancelled) return;
                const safe = Array.isArray(list) ? list : [];
                setCohorts(safe);
                /** Если в sessionStorage когорта, которой больше нет — fallback на первую. */
                setCohortIdState((prev) => {
                    if (prev && safe.some((c) => c.id === prev)) return prev;
                    const first = safe[0]?.id || null;
                    if (first) sessionStorage.setItem(SESSION_KEY_COHORT, first);
                    else sessionStorage.removeItem(SESSION_KEY_COHORT);
                    return first;
                });
            })
            .catch((err) => { if (!cancelled) setError(formatError(err)); })
            .finally(() => { if (!cancelled) setCohortsLoading(false); });
        return () => { cancelled = true; };
    }, []);

    useEffect(() => {
        if (!cohortId) { setRows([]); return undefined; }
        let cancelled = false;
        setLoading(true);
        setError(null);
        pvlPostgrestApi.getAdminProgressSummary(cohortId)
            .then((data) => { if (!cancelled) setRows(Array.isArray(data) ? data : []); })
            .catch((err) => { if (!cancelled) setError(formatError(err)); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [cohortId, refreshCounter]);

    /** Данные для MD-отчёта (загружаются один раз). */
    useEffect(() => {
        if (!pvlPostgrestApi.isEnabled?.()) return undefined;
        let cancelled = false;
        const tag = '[FEAT-016 report v2]';
        const wrap = (label, p) => p
            .then((v) => {
                // eslint-disable-next-line no-console
                console.info(`${tag} ${label}`, Array.isArray(v) ? `${v.length} rows` : v);
                return v;
            })
            .catch((err) => {
                // eslint-disable-next-line no-console
                console.warn(`${tag} ${label} FAILED`, err);
                return { __error: err };
            });
        Promise.all([
            wrap('listHomeworkItems', pvlPostgrestApi.listHomeworkItems()),
            wrap('listContentItems', pvlPostgrestApi.listContentItems()),
            wrap('listCourseWeeks', pvlPostgrestApi.listCourseWeeks()),
            wrap('listCourseLessons', pvlPostgrestApi.listCourseLessons()),
        ]).then(([items, content, ws, lessonsResp]) => {
            if (cancelled) return;
            const firstErr = [items, content, ws, lessonsResp].find((x) => x && x.__error)?.__error;
            if (firstErr) {
                setReportError(`Не удалось подгрузить данные для отчёта: ${formatError(firstErr)}`);
            }
            const safeItems = Array.isArray(items) ? items : [];
            const safeContent = Array.isArray(content) ? content : [];
            const safeWeeks = Array.isArray(ws) ? ws : [];
            const safeLessons = Array.isArray(lessonsResp) ? lessonsResp : [];
            if (safeItems[0]) {
                // eslint-disable-next-line no-console
                console.info(`${tag} sample homework_item`, safeItems[0]);
            }
            if (safeWeeks[0]) {
                // eslint-disable-next-line no-console
                console.info(`${tag} sample course_week`, safeWeeks[0]);
            }
            if (safeLessons[0]) {
                // eslint-disable-next-line no-console
                console.info(`${tag} sample course_lesson`, safeLessons[0]);
            }
            setHomeworkItems(safeItems);
            setContentItems(safeContent);
            setWeeks(safeWeeks);
            setLessons(safeLessons);
        });
        api.getUsers?.()
            .then((users) => {
                if (cancelled) return;
                const map = new Map();
                for (const u of users || []) {
                    if (u?.id) map.set(String(u.id), u.name || '');
                }
                setMentorsById(map);
            })
            .catch((err) => {
                // eslint-disable-next-line no-console
                console.warn('[FEAT-016 report] api.getUsers FAILED', err);
            });
        return () => { cancelled = true; };
    }, []);

    const visibleRows = useMemo(() => {
        let out = rows;
        if (hiddenIds?.length) {
            out = out.filter((r) => !hiddenIds.includes(String(r.student_id)));
        }
        if (stateFilter !== 'all') out = out.filter((r) => r.state_line === stateFilter);
        const { key, dir } = sort;
        const factor = dir === 'asc' ? 1 : -1;
        return [...out].sort((a, b) => compareRows(a, b, key) * factor);
    }, [rows, sort, stateFilter, hiddenIds]);

    const totals = useMemo(() => {
        const visible = hiddenIds?.length
            ? rows.filter((r) => !hiddenIds.includes(String(r.student_id)))
            : rows;
        return buildTotals(visible);
    }, [rows, hiddenIds]);

    const handleSortClick = (key) => {
        setSort((prev) => prev.key === key
            ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
            : { key, dir: 'asc' });
    };

    const handleRefresh = () => setRefreshCounter((c) => c + 1);

    return (
        <div className="surface-card p-8 space-y-6">
            <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                    <h3 className="font-display font-semibold text-slate-900 text-lg">Прогресс студентов ПВЛ</h3>
                    <p className="text-sm text-slate-500 mt-1">
                        Сводка по сданным / на проверке / на доработке / просроченным ДЗ.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <select
                        value={cohortId || ''}
                        onChange={(e) => setCohortId(e.target.value)}
                        disabled={cohortsLoading || cohorts.length === 0}
                        className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm text-slate-700 disabled:opacity-50"
                    >
                        {cohorts.length === 0 && <option value="">— нет когорт —</option>}
                        {cohorts.map((c) => (
                            <option key={c.id} value={c.id}>
                                {c.title}{c.year ? ` · ${c.year}` : ''}
                            </option>
                        ))}
                    </select>
                    <select
                        value={stateFilter}
                        onChange={(e) => setStateFilter(e.target.value)}
                        className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm text-slate-700"
                    >
                        <option value="all">Все состояния</option>
                        {STATE_LINE_OPTIONS.map((s) => (
                            <option key={s} value={s}>{s}</option>
                        ))}
                    </select>
                    <Button
                        variant="ghost"
                        className="!p-2 text-slate-400 hover:text-blue-600"
                        onClick={handleRefresh}
                        disabled={loading || !cohortId}
                        title="Обновить"
                    >
                        <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                    </Button>
                </div>
            </div>

            {pvlPostgrestApi.isEnabled?.() && (
                <div className="flex justify-end">
                    <BulkExportButton
                        visibleStudents={visibleRows}
                        cohortTitle={cohorts.find((c) => c.id === cohortId)?.title || ''}
                        homeworkItems={homeworkItems}
                        contentItems={contentItems}
                        weeks={weeks}
                        lessons={lessons}
                        mentorsById={mentorsById}
                        onError={(err) => setReportError(formatError(err))}
                    />
                </div>
            )}

            {reportError && (
                <div className="flex items-start gap-3 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm">
                    <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                        <div className="font-semibold">Не удалось сформировать отчёт</div>
                        <div className="mt-0.5">{reportError}</div>
                    </div>
                    <button onClick={() => setReportError(null)} className="text-xs underline opacity-70 hover:opacity-100">скрыть</button>
                </div>
            )}

            {totals.total > 0 && (
                <GroupProgressBar
                    totals={totals}
                    cohortLabel={cohorts.find((c) => c.id === cohortId)?.title || ''}
                />
            )}

            <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="px-3 py-1 rounded-full bg-slate-50 border border-slate-200 text-slate-700">
                    Всего: <strong>{totals.total}</strong>
                </span>
                {STATE_LINE_OPTIONS.map((s) => (
                    <span key={s} className={`px-3 py-1 rounded-full border ${STATE_LINE_TONE[s]}`}>
                        {s}: <strong>{totals.counts[s] || 0}</strong>
                    </span>
                ))}
            </div>

            {error && (
                <div className="flex items-start gap-3 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800">
                    <AlertCircle size={18} className="mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                        <div className="font-semibold">Ошибка загрузки</div>
                        <div className="text-sm mt-1">{error}</div>
                    </div>
                    <Button variant="ghost" className="!py-1 !px-3 text-xs" onClick={handleRefresh}>
                        Повторить
                    </Button>
                </div>
            )}

            <div className="overflow-x-auto -mx-2">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="text-slate-500 border-b border-slate-200">
                            {COLUMNS.map((col) => (
                                <th
                                    key={col.key}
                                    className={`px-2 py-2 font-medium ${col.align === 'right' ? 'text-right' : 'text-left'}`}
                                >
                                    {col.sortable === false ? (
                                        <span className="opacity-0 select-none">{col.label || '·'}</span>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={() => handleSortClick(col.key)}
                                            className={`inline-flex items-center gap-1 hover:text-slate-800 transition-colors ${
                                                col.align === 'right' ? 'ml-auto' : ''
                                            } ${sort.key === col.key ? 'text-slate-800' : ''}`}
                                        >
                                            <span>{col.label}</span>
                                            {sort.key === col.key && (
                                                sort.dir === 'asc'
                                                    ? <ArrowUp size={12} />
                                                    : <ArrowDown size={12} />
                                            )}
                                        </button>
                                    )}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {loading && rows.length === 0 && (
                            <tr><td colSpan={COLUMNS.length} className="px-2 py-8 text-center text-slate-400">Загрузка…</td></tr>
                        )}
                        {!loading && rows.length === 0 && !error && (
                            <tr><td colSpan={COLUMNS.length} className="px-2 py-8 text-center text-slate-400">Нет студентов в выбранной когорте.</td></tr>
                        )}
                        {visibleRows.map((r) => (
                            <tr
                                key={r.student_id}
                                className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors"
                            >
                                <td className="px-2 py-2 text-slate-800">{r.full_name || '—'}</td>
                                <td className="px-2 py-2 text-slate-600">{r.mentor_name || '—'}</td>
                                <td className="px-2 py-2 text-right text-slate-700">{r.hw_total ?? 0}</td>
                                <td className="px-2 py-2 text-right text-emerald-700">{r.hw_accepted ?? 0}</td>
                                <td className="px-2 py-2 text-right text-blue-700">{r.hw_in_review ?? 0}</td>
                                <td className="px-2 py-2 text-right text-rose-600">{r.hw_revision ?? 0}</td>
                                <td className="px-2 py-2 text-right text-slate-500">{r.hw_not_started ?? 0}</td>
                                <td className="px-2 py-2 text-right text-rose-700 font-semibold">{r.hw_overdue ?? 0}</td>
                                <td className="px-2 py-2 text-right text-slate-500">{formatActivity(r.last_activity)}</td>
                                <td className="px-2 py-2">
                                    {r.state_line ? (
                                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs border ${STATE_LINE_TONE[r.state_line] || 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                                            {r.state_line}
                                        </span>
                                    ) : '—'}
                                </td>
                                <td className="px-2 py-2 text-right">
                                    {pvlPostgrestApi.isEnabled?.() && (
                                        <ReportDownloadButton
                                            student={r}
                                            cohortTitle={cohorts.find((c) => c.id === cohortId)?.title || ''}
                                            homeworkItems={homeworkItems}
                                            contentItems={contentItems}
                                            weeks={weeks}
                                            lessons={lessons}
                                            mentorsById={mentorsById}
                                            onError={(err) => setReportError(formatError(err))}
                                        />
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {!loading && rows.length > 0 && stateFilter !== 'all' && visibleRows.length === 0 && (
                <div className="text-center text-slate-400 text-sm py-2">
                    В состоянии «{stateFilter}» сейчас никого нет.
                </div>
            )}
        </div>
    );
}
