# DIFF-ON-REVIEW — фронт: кнопки «Вступить» в «Моя подписка» (on-platform, гейт subActive)

**Дата:** 2026-07-10 · **Автор:** codeexec · **Статус:** 🟡 diff на ревью, **НЕ деплоил**. Фронт → окно 403 позже.
**Контекст:** трек «кнопки» из [`_session/252`](2026-07-10_252_handover.md) §🔭.2 + доставка [`_session/251`](2026-07-10_251_codeexec_phase3_join_link_delivery_recon.md) Q2/Q4. Развязка В1 уже на проде ([`_session/257`](2026-07-10_257_codeexec_phase3_v1_decouple_applied.md)).

## Что делаем
В карточке «Моя подписка» ([`views/ProfileView.jsx`](../../views/ProfileView.jsx)) — блок из двух кнопок-ссылок «Вступить в канал/чат Лиги», **виден только при `subActive`** (`paid_until >= now`, строка 341, derive-on-read). Не оплачено → блока нет. Курс и остальной кабинет НЕ трогаем.

## Изменение 1 — module-const URL (после импортов, ~строка 12)
```diff
 import { api } from '../services/dataService';
+
+// Standing invite-ссылки в Лига-сообщество. Клик → заявка chat_join_request →
+// join-поллер авто-approve оплаченного (матч по telegram_user_id/@username). Уже на проде.
+const LIGA_TG_CHANNEL_URL = 'https://t.me/+dVRWs_cl2VA3OTVi';
+const LIGA_TG_CHAT_URL = 'https://t.me/+GH0sjSaUzOc2N2Zi';
```

## Изменение 2 — блок кнопок в Card (после status-плашки, перед блоком планов ~строка 630→632)
```diff
                             )}
 
+                            {subActive && (
+                                <div className="mt-4 space-y-2">
+                                    <div className="text-sm font-medium text-slate-700">Доступ в сообщество Лиги</div>
+                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
+                                        <a
+                                            href={LIGA_TG_CHANNEL_URL}
+                                            target="_blank"
+                                            rel="noopener noreferrer"
+                                            className="flex items-center justify-center gap-2 p-3 rounded-2xl border border-emerald-500 bg-emerald-50/40 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 transition-all"
+                                        >
+                                            <Send className="w-4 h-4" /> Вступить в канал Лиги
+                                        </a>
+                                        <a
+                                            href={LIGA_TG_CHAT_URL}
+                                            target="_blank"
+                                            rel="noopener noreferrer"
+                                            className="flex items-center justify-center gap-2 p-3 rounded-2xl border border-emerald-500 bg-emerald-50/40 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 transition-all"
+                                        >
+                                            <Send className="w-4 h-4" /> Вступить в чат Лиги
+                                        </a>
+                                    </div>
+                                    <div className="text-[11px] text-slate-400 leading-relaxed">
+                                        По ссылке отправится заявка — бот одобрит её автоматически, если ваш Telegram привязан к профилю. Если вы уже участник — ссылка просто откроет канал/чат.
+                                    </div>
+                                </div>
+                            )}
+
                             <div className="mt-4 space-y-3">
                                 <div className="text-sm font-medium text-slate-700">{subActive ? 'Продлить' : 'Выбрать план'}</div>
```
- `Send` уже импортирован (lucide-react, строка 2) — новых импортов нет.
- Стиль повторяет emerald-тему карточки (border-emerald-500 / bg-emerald-50/40), скругления `rounded-2xl` как у кнопок-планов.
- `<a target="_blank" rel="noopener noreferrer">` — открытие в новой вкладке, без утечки `window.opener`.

## Поведение
- **subActive=true:** видны обе кнопки. Клик → `t.me/+…` → Telegram открывает заявку на вступление → поллер (на проде, `mode=admit`) авто-одобряет оплаченного.
- **subActive=false** (не оплачено / истекло): блока нет — ссылки не показываем (гейт по paid, как заказано).
- Гейт полностью на `subActive`; никакой связи с `access_status`/ролью/курсом.

## Оценка: скрывать «Вступить» уже-вступившим (getChatMember) — v1 БЕЗ этого
**Стоимость — заметная, не дешёвая:**
- Нужен **новый backend-эндпоинт** (requireAuth) на push-server: `getChatMember(channel_id, uid)` + `getChatMember(chat_id, uid)` — 2 вызова Bot API на загрузку карточки.
- Нужен **`telegram_user_id` в профиле** — есть НЕ у всех (у части только `@username` или пусто) → для них membership не определить, кнопку всё равно показываем → полу-решение.
- Фронт: fetch на маунте + loading-состояние + обработка «uid нет» / ошибки Bot API + throttle (не долбить getChatMember на каждый рендер).
- Статусы TG (`member/administrator/creator` vs `left/kicked/restricted`) → маппинг «внутри ли».

**Вывод:** это отдельная заметная стройка ради косметики. **Клик уже-вступившего безвреден** (Telegram просто откроет канал/чат либо скажет «вы уже участник»). Подсказка в блоке это проговаривает. → **v1 без membership-check.**

**Флаг отдельным шагом (опционально, если захотите скрывать):**
`GET /api/tg-access/membership` (bot getChatMember ×2, по `telegram_user_id`) + фронт-скрытие кнопок при статусе member+. Оценка: ~полдня, + требует заполненного `telegram_user_id`. Приоритет низкий.

## Нюанс (не блокер v1)
Авто-approve поллером работает, если Telegram кликнувшего сматчен с профилем (`telegram_user_id` или `@username`). Если Telegram не привязан → заявка зависнет pending → ручное одобрение Оли. Это подсказано в тексте блока. Привязку Telegram к профилю — можно отдельным треком (не в этом diff).

## Раскатка
- 🟢 ревью → фронт-деплой **в окно 403** (FTP clean-slate). Незапушенные бэкенд-коммиты (`54f7146` и др.) уедут этим же пушем — ожидаемо.
- Верификация после деплоя: оплаченный юзер видит 2 кнопки, клик → заявка → авто-approve; неоплаченный — кнопок нет.

## Не трогаю
- Курс/роли/остальной кабинет, `access_status`, backend (кроме будущего опц. membership-эндпоинта).
- Ничего не деплоил/не применял.

**Diff на ревью. Жду 🟢 (и подтверждение: v1 без membership-check?).**
