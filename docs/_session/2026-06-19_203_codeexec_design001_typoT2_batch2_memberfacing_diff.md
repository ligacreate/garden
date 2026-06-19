# DESIGN-001 типо-T2 батч 2 (member-facing) — отчёт

**Дата:** 2026-06-19. **Автор:** codeexec. **Статус:** ✅ собран зелёным, закоммичен, задеплоен. (Автономный режим, правила батча 1.)
**Файлы:** index.css (+`.h-sub`), ProfileView, PracticesView, CourseLibraryView, LeaderPageView.

## Новый класс
`.h-sub` — под-заголовок Onest (НЕ Bricolage), 16px/500, line-height 1.3, color ink-strong (overridable). Добавлен в `@layer components`. В батче 2 фактически не понадобился (под-заголовков-кандидатов не встретилось; card-title'ы пошли в `.h-section`); определён для батча 3 / будущего.

## Заголовки → шкала (12, цвет сохранён через kept color-класс)
| Файл | Заголовок | Было | Стало |
|---|---|---|---|
| ProfileView | «Профиль» (страничный) | text-4xl font-light slate-800 | `.h-display` slate-800 |
| ProfileView | {user.name} баннер | text-2xl font-bold white | `.h-section` white |
| ProfileView | {user.name} карточка | text-3xl font-bold slate-900 | `.h-display` slate-900 |
| PracticesView | «Мои практики» | text-4xl font-light slate-800 | `.h-display` slate-800 |
| PracticesView | {practice.title} карточка | text-lg font-bold slate-900 | `.h-section` slate-900 |
| PracticesView | «Ничего не найдено» | text-xl font-medium slate-900 | `.h-section` slate-900 |
| PracticesView | {viewPractice.title} модал | text-3xl font-bold slate-900 | `.h-display` slate-900 |
| CourseLibraryView | title/«Библиотека» | text-4xl font-light slate-800 | `.h-display` slate-800 |
| CourseLibraryView | {course.title} карточка | text-xl font-bold slate-900 | `.h-section` slate-900 |
| CourseLibraryView | «Вход в курс…» | text-2xl font-medium slate-900 | `.h-section` slate-900 |
| CourseLibraryView | {selectedMaterial.title} | text-xl sm:text-2xl medium slate-900 | `.h-section` slate-900 |
| LeaderPageView | {leader.name} (страничный) | text-3xl md:text-4xl font-display semibold slate-900 | `.h-display` slate-900 |

**Правило размера:** text-3xl/4xl/страничный → `.h-display`; text-2xl/xl card-title → `.h-section`. Цвет каждый раз сохранён (slate-800/900/white остаются).

## Декоративный капслок → de-caps (42 спота, ЦВЕТ/размер/вес НЕ тронуты)
De-caps в МЕСТЕ: убраны утилиты `uppercase` + caps-`tracking-*` на 42 строках (ProfileView 16, PracticesView 7, CourseLibraryView 10, LeaderPageView 9). Размер/вес/цвет каждой строки сохранены (например `text-[10px] uppercase text-slate-400 font-bold tracking-wider` → `text-[10px] text-slate-400 font-bold`). Скриптом, с сохранением CRLF и отступов.

**Что попало:** form-field `<label>`'ы (Имя/Дата/…), статус-чипы/теги (Видео/PDF), section-kicker'ы («В базе», «Материал», «Сила дерева», «Управление аккаунтом»), stat-лейблы.

## ⚠️ Развилка (эскалация в отчёт, не блокирующая) — eyebrow'ы НЕ переведены в `.text-meta`
Правило батча 1: «капслок-eyebrow → `.text-meta`». В member-facing я **de-capsed в месте, но НЕ навешивал `.text-meta`**, потому что:
1. Многие капс-лейблы — это **form-field `<label>`'ы** (text-[10px] font-bold), компактные функциональные; `.text-meta` (13px/400) раздул бы и облегчил их.
2. Часть лейблов — **white-on-dark** (на баннере профиля, `text-white/60`); `.text-meta` несёт тёмный ink-soft → на тёмном фоне нечитаемо (сама спека: «.text-meta для светлых поверхностей»).
3. «Цвет не менять»: где цвет slate-400, `.text-meta text-slate-400` сохранил бы цвет, но смена размера 10→13 на десятках form-лейблов — широкий визуальный сдвиг.

→ Выбрал **de-caps без смены размера/цвета** (нормальный регистр достигнут, цвета строго не тронуты). Если стратег хочет именно `.text-meta` на истинных section-kicker'ах (не form-labels) — скажи, доконвертирую точечно отдельным микрошагом.

## Не тронуто
- LeaderPageView `<style>` `.title{text-transform:uppercase}` — это raw-CSS публичной leader-карточки (отдельная система), НЕ Tailwind-утилита; оставлен (1 «uppercase» в файле — он).
- Числа (font-mono счётчики, stat-values text-3xl) — не заголовки, не тронуты.
- prose-стили рич-контента (`[&_h1]:text-2xl`) — контентная типографика, не UI-chrome.
- Цвета/палитра/хексы — НЕ тронуты (проверяемо: kept color-классы).

## Verified
Сборка зелёная; 0 декоративного капслока (кроме raw-CSS); 12 заголовков на шкале с сохранёнными цветами; CRLF сохранён; диф 63+/54−.
