import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, CloudOff, Loader2 } from 'lucide-react';
import Button from '../components/Button';
import { api } from '../services/dataService';

/**
 * Кубик ведущей — личная сетка шесть граней по девять ячеек.
 *
 * Структура фиксированная и живёт здесь, в коде: грани — недели курса, ряды —
 * «знаю / говорю / делаю», центр грани неподвижен. В базе лежат только числа
 * (face 1–6, pos 0–8) и текст, см. migrations/2026-07-27_cube_cells.sql.
 *
 * Правило курса: квадрат нельзя придумать, его можно только добыть. Поэтому
 * здесь нет ни процентов, ни счётчиков, ни подсветки пустых ячеек — пустая
 * ячейка это нормальное состояние, а не недоделка.
 */

const FACES = [
    { face: 1, title: 'Почерк' },
    { face: 2, title: 'Круг' },
    { face: 3, title: 'Упаковка' },
    { face: 4, title: 'Приглашения' },
    { face: 5, title: 'Проба пера' },
    { face: 6, title: 'Ритм' }
];

/**
 * Раскладка три на три в порядке чтения:
 *   0 1 2  — знаю
 *   3 4 5  — говорю слева и справа, 4 — центр грани
 *   6 7 8  — делаю
 */
const POSITIONS = [
    { pos: 0, group: 'знаю' },
    { pos: 1, group: 'знаю' },
    { pos: 2, group: 'знаю' },
    { pos: 3, group: 'говорю' },
    { pos: 4, group: 'центр' },
    { pos: 5, group: 'говорю' },
    { pos: 6, group: 'делаю' },
    { pos: 7, group: 'делаю' },
    { pos: 8, group: 'делаю' }
];

const CENTER_POS = 4;

const GROUP_HINT = {
    'знаю': 'Что вы теперь знаете — добытое чтением, разбором, наблюдением.',
    'говорю': 'Что вы теперь говорите вслух — своими словами, кому-то живому.',
    'делаю': 'Что вы теперь делаете — шаг, который уже сделан, а не запланирован.',
    'центр': 'Перевёрнутое убеждение недели. Формулируете сами в понедельник.'
};

const AUTOSAVE_DELAY_MS = 800;
const RESCUE_KEY = (userId) => `garden_cube_rescue_${userId}`;

const cellKey = (face, pos) => `${face}:${pos}`;
const isBlank = (cell) => !String(cell?.title || '').trim() && !String(cell?.body || '').trim();

/**
 * Спасательный буфер: сюда текст попадает ТОЛЬКО когда сохранение на сервер
 * не прошло. Это не второй источник правды, а страховка от потери набранного —
 * женщина пишет по пять–пятнадцать минут, терять это нельзя. При успешном
 * сохранении запись стирается, при загрузке применяется лишь та, что новее
 * серверной версии.
 */
const readRescue = (userId) => {
    try {
        const raw = localStorage.getItem(RESCUE_KEY(userId));
        return raw ? JSON.parse(raw) : {};
    } catch {
        return {};
    }
};

const writeRescue = (userId, key, value) => {
    try {
        const all = readRescue(userId);
        if (value) all[key] = value;
        else delete all[key];
        localStorage.setItem(RESCUE_KEY(userId), JSON.stringify(all));
    } catch {
        /* приватный режим или переполнение — сохранение на сервер этим не ломаем */
    }
};

const SaveStatus = ({ status }) => {
    if (status === 'saving') {
        return (
            <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
                <Loader2 size={13} className="animate-spin" />
                Сохраняем…
            </span>
        );
    }
    if (status === 'saved') {
        return (
            <span className="inline-flex items-center gap-1.5 text-xs text-emerald-600">
                <Check size={13} />
                Сохранено
            </span>
        );
    }
    if (status === 'error') {
        return (
            <span className="inline-flex items-center gap-1.5 text-xs text-amber-700">
                <CloudOff size={13} />
                Не сохранилось — текст цел, попробуем ещё раз
            </span>
        );
    }
    return <span className="text-xs text-transparent select-none">.</span>;
};

const CubeView = ({ user }) => {
    const userId = user?.id || null;

    const [cells, setCells] = useState({});
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(null);
    const [activeFace, setActiveFace] = useState(null);
    const [activeCell, setActiveCell] = useState(null); // { face, pos }
    const [saveStatus, setSaveStatus] = useState('idle'); // idle | saving | saved | error

    /** Черновик открытой ячейки — то, что уже набрано, но, возможно, ещё не долетело. */
    const [draft, setDraft] = useState({ title: '', body: '' });
    const draftRef = useRef(draft);
    const dirtyRef = useRef(false);
    const timerRef = useRef(null);
    const activeCellRef = useRef(null);

    useEffect(() => { draftRef.current = draft; }, [draft]);
    useEffect(() => { activeCellRef.current = activeCell; }, [activeCell]);

    // ── Загрузка ────────────────────────────────────────────────────────────
    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            if (!userId) return;
            setLoading(true);
            setLoadError(null);
            try {
                // userId передаём явно: у куратора и админа RLS пускает чужие строки,
                // и запрос без фильтра склеил бы в один кубик всех участниц.
                const rows = await api.getCubeCells(userId);
                if (cancelled) return;

                const map = {};
                (rows || []).forEach((row) => {
                    map[cellKey(row.face, row.pos)] = {
                        title: row.title || '',
                        body: row.body || '',
                        updated_at: row.updated_at || null
                    };
                });

                // Применяем спасательный буфер там, где он новее серверной версии.
                const rescue = readRescue(userId);
                Object.entries(rescue).forEach(([key, saved]) => {
                    const serverAt = map[key]?.updated_at ? Date.parse(map[key].updated_at) : 0;
                    const rescueAt = saved?.at ? Date.parse(saved.at) : 0;
                    if (rescueAt > serverAt) {
                        map[key] = { title: saved.title || '', body: saved.body || '', updated_at: null };
                    } else {
                        writeRescue(userId, key, null);
                    }
                });

                setCells(map);
            } catch (e) {
                if (!cancelled) setLoadError(e?.message || 'Не удалось загрузить кубик');
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        load();
        return () => { cancelled = true; };
    }, [userId]);

    // ── Сохранение ──────────────────────────────────────────────────────────
    const persist = useCallback(async ({ keepalive = false } = {}) => {
        const target = activeCellRef.current;
        if (!target || !userId || !dirtyRef.current) return;

        const { title, body } = draftRef.current;
        const key = cellKey(target.face, target.pos);

        if (!keepalive) setSaveStatus('saving');
        try {
            await api.saveCubeCell({ userId, face: target.face, pos: target.pos, title, body, keepalive });
            dirtyRef.current = false;
            writeRescue(userId, key, null);
            setCells((prev) => ({
                ...prev,
                [key]: { title, body, updated_at: new Date().toISOString() }
            }));
            if (!keepalive) setSaveStatus('saved');
        } catch (e) {
            // Текст остаётся в поле и уходит в спасательный буфер — не теряем ничего.
            writeRescue(userId, key, { title, body, at: new Date().toISOString() });
            if (!keepalive) setSaveStatus('error');
            console.error('cube save failed', e);
        }
    }, [userId]);

    /** Автосохранение по паузе в наборе. */
    useEffect(() => {
        if (!activeCell || !dirtyRef.current) return undefined;
        if (timerRef.current) window.clearTimeout(timerRef.current);
        timerRef.current = window.setTimeout(() => { persist(); }, AUTOSAVE_DELAY_MS);
        return () => {
            if (timerRef.current) window.clearTimeout(timerRef.current);
        };
    }, [draft, activeCell, persist]);

    /** Уход со страницы, сворачивание вкладки, блокировка телефона. */
    useEffect(() => {
        const onHide = () => {
            if (document.visibilityState === 'hidden') persist({ keepalive: true });
        };
        const onPageHide = () => persist({ keepalive: true });
        const onBeforeUnload = (e) => {
            if (!dirtyRef.current) return undefined;
            e.preventDefault();
            e.returnValue = '';
            return '';
        };
        document.addEventListener('visibilitychange', onHide);
        window.addEventListener('pagehide', onPageHide);
        window.addEventListener('beforeunload', onBeforeUnload);
        return () => {
            document.removeEventListener('visibilitychange', onHide);
            window.removeEventListener('pagehide', onPageHide);
            window.removeEventListener('beforeunload', onBeforeUnload);
        };
    }, [persist]);

    const openCell = (face, pos) => {
        const existing = cells[cellKey(face, pos)] || { title: '', body: '' };
        dirtyRef.current = false;
        setSaveStatus('idle');
        setDraft({ title: existing.title || '', body: existing.body || '' });
        setActiveCell({ face, pos });
    };

    const closeCell = async () => {
        if (timerRef.current) window.clearTimeout(timerRef.current);
        await persist();
        setActiveCell(null);
        setSaveStatus('idle');
    };

    const changeDraft = (patch) => {
        dirtyRef.current = true;
        setSaveStatus('idle');
        setDraft((prev) => ({ ...prev, ...patch }));
    };

    const activeFaceMeta = useMemo(
        () => FACES.find((f) => f.face === activeFace) || null,
        [activeFace]
    );

    if (!userId) return null;

    // ── Экран 3: редактор ячейки ────────────────────────────────────────────
    if (activeCell) {
        const meta = FACES.find((f) => f.face === activeCell.face);
        const group = POSITIONS.find((p) => p.pos === activeCell.pos)?.group || 'знаю';
        const isCenter = activeCell.pos === CENTER_POS;

        return (
            <div className="pt-6 px-4 lg:px-0 pb-28 md:pb-12 animate-in fade-in">
                <button
                    type="button"
                    onClick={closeCell}
                    className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800 mb-6"
                >
                    <ArrowLeft size={16} />
                    К грани «{meta?.title}»
                </button>

                <div className="bg-white/80 backdrop-blur-xl rounded-[2rem] border border-white/50 p-5 sm:p-8 max-w-2xl">
                    <div className="mb-6">
                        <div className="text-xs uppercase tracking-wider text-slate-400 mb-1">
                            {isCenter ? 'Центр грани' : group}
                        </div>
                        <h2 className="h-section text-slate-900">{meta?.title}</h2>
                        <p className="text-sm text-slate-500 mt-2 leading-relaxed">{GROUP_HINT[group]}</p>
                    </div>

                    <div className="space-y-5">
                        <div className="space-y-1.5">
                            <label className="text-sm font-medium text-slate-700 block">
                                {isCenter ? 'Перевёрнутое убеждение' : 'Заголовок'}
                            </label>
                            <input
                                type="text"
                                value={draft.title}
                                onChange={(e) => changeDraft({ title: e.target.value })}
                                onBlur={() => persist()}
                                placeholder={isCenter ? 'Одна фраза своими словами' : 'Два-четыре слова'}
                                className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 outline-none text-slate-800 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-sm font-medium text-slate-700 block">Добыто: когда, где</label>
                            <textarea
                                value={draft.body}
                                onChange={(e) => changeDraft({ body: e.target.value })}
                                onBlur={() => persist()}
                                rows={7}
                                placeholder="Где это случилось, с кем, что именно вы сделали"
                                className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 outline-none text-slate-800 resize-y leading-relaxed focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all"
                            />
                        </div>

                        <div className="flex items-center justify-between gap-3 pt-1">
                            <SaveStatus status={saveStatus} />
                            <div className="flex gap-2">
                                {saveStatus === 'error' && (
                                    <Button variant="secondary" onClick={() => persist()}>Сохранить ещё раз</Button>
                                )}
                                <Button variant="primary" onClick={closeCell}>Готово</Button>
                            </div>
                        </div>

                        <p className="text-xs text-slate-400 leading-relaxed pt-2">
                            Квадрат можно оставить пустым. Пустой квадрат — это честно: он ждёт своего шага,
                            а не считается недоделкой.
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    // ── Экран 2: одна грань, сетка три на три ───────────────────────────────
    if (activeFaceMeta) {
        return (
            <div className="pt-6 px-4 lg:px-0 pb-28 md:pb-12 animate-in fade-in">
                <button
                    type="button"
                    onClick={() => setActiveFace(null)}
                    className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800 mb-6"
                >
                    <ArrowLeft size={16} />
                    Ко всем граням
                </button>

                <h1 className="h-display text-slate-800 mb-1">{activeFaceMeta.title}</h1>
                <p className="text-slate-400 font-light mb-8">
                    Верхний ряд — знаю, по бокам от центра — говорю, нижний ряд — делаю.
                </p>

                <div className="grid grid-cols-3 gap-2.5 sm:gap-4 max-w-2xl">
                    {POSITIONS.map(({ pos, group }) => {
                        const cell = cells[cellKey(activeFaceMeta.face, pos)];
                        const empty = isBlank(cell);
                        const isCenter = pos === CENTER_POS;
                        return (
                            <button
                                key={pos}
                                type="button"
                                onClick={() => openCell(activeFaceMeta.face, pos)}
                                className={`aspect-square rounded-2xl sm:rounded-[1.5rem] border p-2.5 sm:p-4 text-left flex flex-col transition-all active:scale-[0.98] ${isCenter
                                    ? 'border-blue-200 bg-blue-50/60 hover:bg-blue-50'
                                    : 'border-slate-100 bg-white/80 hover:bg-white'
                                    }`}
                            >
                                <span className="text-[10px] uppercase tracking-wider text-slate-400 mb-1.5">
                                    {isCenter ? 'центр' : group}
                                </span>
                                <span className={`text-[13px] sm:text-sm leading-snug line-clamp-4 ${empty ? 'text-slate-300' : 'text-slate-800 font-medium'}`}>
                                    {empty ? '' : (cell.title || cell.body)}
                                </span>
                            </button>
                        );
                    })}
                </div>

                <p className="text-xs text-slate-400 mt-6 max-w-2xl leading-relaxed">
                    Квадрат нельзя придумать, его можно только добыть действием. Пустые квадраты остаются
                    пустыми — и это правильно.
                </p>
            </div>
        );
    }

    // ── Экран 1: шесть граней ───────────────────────────────────────────────
    return (
        <div className="pt-6 px-4 lg:px-0 pb-28 md:pb-12 animate-in fade-in">
            <div className="mb-8">
                <h1 className="h-display text-slate-800">Мой кубик</h1>
                <p className="text-slate-400 mt-1 font-light">
                    Шесть граней курса. Каждая грань — девять квадратов, добытых за неделю.
                </p>
            </div>

            {loading && <p className="text-slate-400 text-sm">Загружаем кубик…</p>}

            {loadError && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 max-w-xl">
                    {loadError}. Обновите страницу — набранный текст никуда не делся.
                </div>
            )}

            {!loading && !loadError && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {FACES.map(({ face, title }) => {
                        const filled = POSITIONS
                            .map(({ pos }) => cells[cellKey(face, pos)])
                            .filter((c) => !isBlank(c));
                        const preview = filled.map((c) => c.title).filter(Boolean).slice(0, 3);
                        return (
                            <button
                                key={face}
                                type="button"
                                onClick={() => setActiveFace(face)}
                                className="bg-white/80 backdrop-blur-xl rounded-[2rem] border border-white/50 p-6 text-left hover:shadow-md transition-all active:scale-[0.99] flex flex-col min-h-[168px]"
                            >
                                <span className="text-xs uppercase tracking-wider text-slate-400 mb-2">
                                    Грань {face}
                                </span>
                                <span className="h-section text-slate-900 mb-3">{title}</span>
                                <span className="text-sm text-slate-500 leading-relaxed mt-auto">
                                    {preview.length > 0 ? preview.join(' · ') : 'Открыть грань'}
                                </span>
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default CubeView;
