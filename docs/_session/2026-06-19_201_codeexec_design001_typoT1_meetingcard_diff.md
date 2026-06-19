# Diff на ревью — DESIGN-001 типо-T1: шкала + meta-классы + пилот MeetingCard

**Дата:** 2026-06-19. **Автор:** codeexec (VS Code). **Статус:** написан локально, сборка зелёная. **НЕ закоммичен — жду 🟢 (есть суждения по eyebrow'ам + один color-via-token нюанс).**
**Файлы:** index.css (@layer components), components/MeetingCard.jsx. **План:** _197 (типо-проход T1).

---

## 1. TL;DR

Часть 1 — добавил `.h-display` / `.h-section` / `.text-meta` (тип-онли, на токенах Фазы A). Часть 2 — пилот на **MeetingCard** (карточка встречи/итогов — ближе всего к моку «Сертификационная встреча · 16 мая 2026», self-contained, светлый `surface-card`). Сборка зелёная. Прочие экраны не тронуты; `.section-title`/`.section-kicker` не удалял.

**Выбор пилота:** MeetingCard, а не PvlMenteeCardView — у неё чистая связка заголовок + капс-pill + дата-eyebrow + капс-микролейблы статистики, и она одна из самых видимых (лента MeetingsView).

---

## 2. Часть 1 — классы (как в спеке, 1:1)

```css
.h-display { font-family: var(--font-display); font-size:1.75rem; font-weight:500; line-height:1.05; letter-spacing:-0.01em; color:var(--color-ink-strong); }
.h-section { font-family: var(--font-display); font-size:1.25rem; font-weight:500; line-height:1.15; letter-spacing:-0.005em; color:var(--color-ink-strong); }
.text-meta { font-size:0.8125rem; font-weight:400; color:var(--color-ink-soft); }
```
Добавлены после `.font-display` в `@layer components`. Скомпилированы, проверил.

---

## 3. Часть 2 — что счёл «декоративным eyebrow» и тронул (сверьте суждение)

| Спот | Было | Стало | Тип изменения |
|---|---|---|---|
| **Заголовок встречи** (h3:123) | `text-xl font-display font-semibold text-slate-900` | `.h-section` | размер тот же (20px), шрифт display, вес 600→**500**, цвет slate-900→ink-strong |
| **Статус-pill** (115) | `text-[10px] font-bold **uppercase** tracking-wider` + `getStatusColor()` | `text-xs font-semibold` + `getStatusColor()` | de-caps «ЗАПЛАНИРОВАНА»→«Запланирована»; **цвет pill НЕ тронут** |
| **Дата-eyebrow** (118) | `text-xs text-slate-400 font-medium` | `.text-meta` | нормальный регистр уже был; 12→13px, цвет slate-400→ink-soft |
| **h4 «Чеклист подготовки»** (208) | `text-sm **uppercase** tracking-wide` bold | `text-sm` bold | de-caps, размер/цвет те же |
| **Микролейблы статистики** Гостей/Новеньких/Доход (255/259/263) | `text-[10px] **uppercase** font-bold text-slate-400` | `.text-meta` | de-caps, 10→13px, цвет slate-400→ink-soft |

**Что НЕ трогал (счёл семантическим / вне типо-scope):**
- Цвета pill'ов статуса (`getStatusColor`: blue/amber/green/slate-фон) — это семантика статуса, акцент придёт с Фазой D.
- Бейдж «+баллов», «Встречу проводит стажер», «Дата прошла, внесите результат!» — не капс-eyebrow'ы, содержательные строки.
- h4 «Что классно»/«Зона роста»/«Причина отмены» — не были капсом, не трогал.
- В MeetingCard **семантических капсов нет** (статус несёт цвет pill + текст, не капс) — поэтому de-caps всех капсов безопасен.

---

## 4. ⚠️ Нюанс на сверку: color-via-token

Классы `.h-*`/`.text-meta` по определению (ваша спека) несут цвет-токены `ink-strong`/`ink-soft`. Применение их к пилоту = лёгкий сдвиг цвета текста **через токены** (не хардкод-хексы, не Фаза-D-миграция, не перекраска pill/акцентов):
- Заголовок: slate-900 `#241f19` → ink-strong `#2C1810` — практически тот же near-black, глазом неразличимо.
- Meta/лейблы: slate-400 `#b3a18a` (≈низкий контраст) → ink-soft `#7A6758` — **темнее, лучше читается** (в духе B3, AA).

Спека сама отмечает «эти классы выставляют тёмный текст» — т.е. цвет заголовков/меты через токен задуман как часть типо-системы. Фиксирую для прозрачности: формально это меняет пиксели цвета текста, но строго в рамках токенов Фазы A и только на заголовках/мете, не на палитре/акцентах.

---

## 5. Чего НЕ сделал из части 4 (сознательно, на сверку)

- **body 15px** — не поднимал. Под него нет класса в части 1, а глобально менять body-текст карточки (`text-sm` 14px → 15px) — широкий и рискованный для раскладки шаг. Рекомендую завести `.text-body` отдельным шагом (T2) и катать осознанно. В пилоте body оставил `text-sm`.
- **Доп. воздух** — спейсинг карточки уже разумный; намеренно не раздувал, чтобы не двигать раскладку ленты. Шкала и так выровнялась (h-section 20px → meta 13px → body 14px).

---

## 6. Что НЕ затронуто / scope-guard

- Только тип: размер/шрифт/регистр/spacing + цвет-токены заголовков/меты. Ни одного `#хекса` в JSX не тронул. Палитра/Фаза-D — нет.
- `.section-title` / `.section-kicker` — не удалял (used другими экранами); на пилоте просто не применял.
- Reduced-motion / прочие экраны — не трогал.
- Сборка зелёная; `.h-display`/`.h-section`/`.text-meta` скомпилированы; в MeetingCard 0 `uppercase`.

## 7. Acceptance (глазами, делегируется Chrome)

Лента «Встречи»: карточка читается редакторски — Bricolage-заголовок на единой шкале, без капс-шума (pill «Запланирована», лейблы статистики нормальным регистром), цвета акцентов/pill не изменились. Развёрнутая карточка (итоги) — лейблы Гостей/Новеньких/Доход спокойные.

## 8. Apply-порядок (после 🟢)
1. `git add index.css components/MeetingCard.jsx docs/_session/2026-06-19_201_*.md`
2. Commit: `design(DESIGN-001): typo T1 — heading scale + meta classes + pilot MeetingCard`
3. `git push origin main` → FTP. Пост-деплой smoke: главная 200, свежий бандл.

## 9. Предлагаемый commit message
```
design(DESIGN-001): typo T1 — heading scale + meta classes + pilot MeetingCard

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
```
