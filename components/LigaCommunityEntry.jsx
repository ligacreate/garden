import React from 'react';
import { Send, CheckCircle2, Link as LinkIcon } from 'lucide-react';
import {
    LIGA_TG_CHANNEL_URL,
    LIGA_TG_CHAT_URL,
    isLigaCommunityMember,
    hasTelegramLinked
} from '../utils/ligaCommunity';

/**
 * Вход в канал и чат Лиги — двумя шагами и в правильном порядке.
 *
 * Зачем: ссылки жили только в профиле, внутри карточки «Моя подписка», —
 * участницы их не находили. И порядок ничем не держался: можно было
 * отправить заявку с непривязанным Telegram, бот такую заявку не опознаёт,
 * и она висела без ответа.
 *
 * Поэтому: пока Telegram не привязан, кнопки «Вступить» ведут на привязку,
 * а не в Telegram. Один и тот же блок стоит на дашборде и в профиле.
 *
 * @param {object}   props.user
 * @param {Function} props.onNeedTelegram — что делать, когда TG не привязан:
 *        в профиле открыть модалку с кодом, на дашборде увести в профиль.
 * @param {string}   [props.needTelegramLabel] — подпись кнопки первого шага.
 */
const Step = ({ number, done = false, title, children }) => (
    <div className="flex gap-3">
        <div className={`w-7 h-7 shrink-0 rounded-full flex items-center justify-center text-xs font-bold
            ${done ? 'bg-emerald-500 text-white' : 'bg-white text-emerald-700 border border-emerald-300'}`}>
            {done ? <CheckCircle2 size={16} /> : number}
        </div>
        <div className="flex-1 min-w-0 space-y-2">
            <div className="text-sm font-semibold text-slate-800">{title}</div>
            {children}
        </div>
    </div>
);

const LigaCommunityEntry = ({ user, onNeedTelegram, needTelegramLabel = 'Привязать Telegram', className = '' }) => {
    if (!isLigaCommunityMember(user)) return null;

    const isLinked = hasTelegramLinked(user);

    const joinButtonClass = `flex items-center justify-center gap-2 p-3 rounded-2xl border text-sm font-semibold transition-all
        ${isLinked
            ? 'border-emerald-500 bg-emerald-50/40 text-emerald-700 hover:bg-emerald-50'
            : 'border-slate-200 bg-white text-slate-400 hover:border-emerald-300 hover:text-emerald-700'}`;

    return (
        <div className={`rounded-[2rem] border border-emerald-100 bg-emerald-50/40 p-5 sm:p-6 space-y-4 ${className}`}>
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                    <Send className="w-5 h-5" />
                </div>
                <div>
                    <h3 className="font-bold text-slate-800 leading-tight">Сообщество Лиги в Telegram</h3>
                    <p className="text-xs text-slate-500">Канал с анонсами и чат ведущих — два шага, и вы внутри.</p>
                </div>
            </div>

            <Step number="1" done={isLinked} title={isLinked ? 'Telegram привязан' : 'Привяжите Telegram'}>
                {isLinked ? (
                    <p className="text-xs text-slate-500 leading-relaxed">
                        Бот узнаёт вас по привязке и одобряет заявку сам.
                    </p>
                ) : (
                    <>
                        <p className="text-xs text-slate-500 leading-relaxed">
                            Без привязки бот не поймёт, чья это заявка, и она останется висеть без ответа.
                        </p>
                        <button
                            type="button"
                            onClick={onNeedTelegram}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition-colors"
                        >
                            <LinkIcon className="w-4 h-4" /> {needTelegramLabel}
                        </button>
                    </>
                )}
            </Step>

            <Step number="2" title="Вступите в канал и чат">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {isLinked ? (
                        <>
                            <a href={LIGA_TG_CHANNEL_URL} target="_blank" rel="noopener noreferrer" className={joinButtonClass}>
                                <Send className="w-4 h-4" /> Канал Лиги
                            </a>
                            <a href={LIGA_TG_CHAT_URL} target="_blank" rel="noopener noreferrer" className={joinButtonClass}>
                                <Send className="w-4 h-4" /> Чат Лиги
                            </a>
                        </>
                    ) : (
                        <>
                            <button type="button" onClick={onNeedTelegram} className={joinButtonClass}>
                                <Send className="w-4 h-4" /> Канал Лиги
                            </button>
                            <button type="button" onClick={onNeedTelegram} className={joinButtonClass}>
                                <Send className="w-4 h-4" /> Чат Лиги
                            </button>
                        </>
                    )}
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                    {isLinked
                        ? 'По ссылке уйдёт заявка — бот одобрит её автоматически. Если вы уже участница, ссылка просто откроет канал или чат.'
                        : 'Кнопки откроются после привязки Telegram — так заявка не потеряется.'}
                </p>
            </Step>
        </div>
    );
};

export default LigaCommunityEntry;
