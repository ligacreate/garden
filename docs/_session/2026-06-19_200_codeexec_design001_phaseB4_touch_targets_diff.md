# Diff на ревью — DESIGN-001 Фаза B4: тач-таргеты ≥44×44

**Дата:** 2026-06-19. **Автор:** codeexec (VS Code). **Статус:** ✅ 🟢 Ольга выбрала «Полный безопасный» scope + FLAG→backlog. Вся Группа A применена (14 файлов), сборка зелёная, закоммичено. **Визуальный 390px-чек делегируется Chrome (как в спеке).**
**План:** docs/_session/2026-06-18_197_strategist_design_audit_plan.md (Фаза B).

> **РЕЗОЛЮЦИЯ (2026-06-19):** scope = **вся Группа A** (~27 контролов, 14 файлов): mentee-pills, AdminPanel edit/delete/refresh icon-кнопки, AdminPvlProgress download (w-8→w-11), Practices pencil, Treasury/CRM/Profile refresh-add, MeetingsView+CalendarWidget навигация, CommunicationsView, UserApp меню/закрыть, MeetingCard chevron, ConfirmationModal+ModalShell крестики. Техника A везде (растёт хит-зона до ≥44, иконка не меняется). **FLAG-кластеры** (§4) НЕ тронуты → заведён подпункт **DESIGN-001-B4-FOLLOWUP (P2)** в plans/BACKLOG.md.

---

## 1. TL;DR

Системный аудит двумя Explore-агентами по views/ + components/ → **~46 интерактивных контролов** с хит-зоной <44px. Не все одинаковы: часть растёт безопасно (technique A), часть — плотные горизонтальные кластеры, где честные 44px ломают раскладку или дают перекрытие хит-зон → **флагаю на решение** (как просили). Применять всё подряд нельзя — нужен ваш scope-выбор (вопрос внизу).

**Уже применил как proof (2 файла, сборка зелёная):**
- `PvlMenteeCardView` — все 10 mentor-action pills (вкл. named-кластер «Действия ментора», 574-580): `min-h-[44px] inline-flex items-center justify-center`. Визуально pill чуть выше, плотность сохранена, **горизонтального переноса нет** (см. §3).
- `AdminPanel` — 9 icon-кнопок edit/delete (p-2 → technique A).

---

## 2. Важная правка к вводным

Спека описала PvlMenteeCardView pill-кластер как «~7 в ряд» (горизонтальный). **По факту это вертикальный `<div className="grid gap-2">`** — 7 full-width pills стопкой (574-580), плюс одиночные inline-pills (387, 466, 467). То есть <44 только по ВЫСОТЕ; ширина уже полная. → растим высоту до 44 (`min-h-[44px]`), и это **безопасно** (стопка тянется вниз, ничего не «разъезжается»). technique B (::after) тут не нужен.

---

## 3. Техники (как договаривались)

**Technique A — отдельностоящие/растяжимые** (большинство): `inline-flex items-center justify-center min-h-[44px] min-w-[44px]` (для icon-only) либо `min-h-[44px] inline-flex items-center justify-center` (для full-width/inline pills). Визуальный размер иконки НЕ меняется — растёт хит-зона. Доказано сборкой: `.min-h-[44px]{min-height:44px}`, `.min-w-[44px]{min-width:44px}` эмитятся.

**Technique B — псевдоэлемент ::after** для контрола, который НЕЛЬЗЯ растить визуально. ВАЖНЫЙ нюанс, всплывший при анализе: ::after-зона 44px на 24-28px кнопке вылезает на ±8-10px и в ПЛОТНОМ ряду (gap-1) **перекрывает соседей → неоднозначный тап**. Поэтому technique B чисто работает только для ИЗОЛИРОВАННЫХ мелких контролов с запасом места вокруг. В наших плотных кластерах он создаёт перекрытие — поэтому такие кластеры флагаю, а не «чиню» ::after'ом вслепую.

---

## 4. Триаж всех ~46 контролов

### ✅ Группа A — растим безопасно (technique A). Рекомендую в этот коммит.
- **PvlMenteeCardView** — 10 mentor pills (✓ уже сделано).
- **AdminPanel** — edit/delete icon-кнопки p-2 в `flex gap-2` hover-группах: 9 шт (✓ уже сделано) + refresh `<Button !p-2>` 789/898 (2).
- **AdminPvlProgress:232** — download/expand `w-8 h-8` → `w-11 h-11` (44).
- **TreasuryView:211**, **CRMView:117**, **ProfileView:110** — `<Button !p-2>` refresh/add (3).
- **MeetingsView:82/86** — календарная навигация `w-8 h-8` (2).
- **CalendarWidget:29/35** — навигация месяца `p-1` (2).
- **CommunicationsView:580** — удалить вложение `p-1.5` (1).
- **UserApp:886/908** — мобильное меню/закрыть (2).
- **MeetingCard:182** — chevron раскрытия `p-2` (1).
- **ConfirmationModal:20**, **ModalShell:116** — крестик закрытия `p-2` (2).
- **PracticesView:429** — карандаш редактирования `<Pencil size={18}>` (1).
Итого A ≈ **27** (из них 19 уже применены).

### ⚠️ Группа FLAG — 44px недостижимо чисто без изменения раскладки/перекрытия. Решение за вами.
- **RichEditor.jsx 437-480** — тулбар, `flex flex-wrap gap-1`, **12 кнопок p-1.5 (28px)**. Рост каждой до 44 → на 390px тулбар разбухает в 3-4 ряда по 44px (chunky); ::after перекрывает соседей. Вариант: оставить (десктоп-редактор) ИЛИ принять «толстый» тулбар.
- **PvlPrototypeApp.jsx 4554-4558** — ряд из 5 кнопок управления вопросом квиза (text-[11px] px-2 py-1), `gap-1`. Тот же конфликт. Также 4586, 6993-6996 (3 pill в ряд), 8014 (debug).
- **BuilderView.jsx 1045/1046** — вертикальная пара move-up/down `p-1` (28px), `gap-1` — тесно; 1089 — X без паддинга.
- **MeetingsView.jsx 448/451/479** — inline пара edit/delete `p-1` рядом с текстом.
- **ProfileView.jsx:92** — крестик удаления тега ВНУТРИ chip (`inline-flex gap-1`); рост ломает chip, ::after перекрывает соседние теги.

**Рекомендация по FLAG:** в этот коммит не трогать; для них либо (Б1) лёгкий компромисс — поднять до 36-40px где влезает без переноса, либо (Б2) отдельная задача «переверстать плотные кластеры в tap-friendly раскладку» (например тулбар → группировка, квиз-контролы → меню «⋯»). Это уже верстка, не точечный хит-фикс.

---

## 5. Что предлагаю закоммитить (по 🟢)

**Минимум (named acceptance):** только Группа A на ПВЛ/менторских + ключевые icon-actions (mentee pills ✓, AdminPvlProgress download, PracticesView pencil, Treasury/Admin refresh, edit/delete). FLAG — отдельно.

**Полный безопасный (рекоменд.):** вся Группа A (~27) одним коммитом; FLAG-кластеры вынесены в backlog-подпункт DESIGN-001. 

В любом случае FLAG-кластеры НЕ трогаю без отдельного решения.

## 6. Что НЕ затронуто
- `.btn-*` (py-3, уже ≥44) — не трогаю.
- Неинтерактивные иконки/спаны — не трогаю.
- Визуальный размер иконок везде сохранён (растёт только хит-бокс).

## 7. Acceptance / проверка
- Хит-зона ≥44×44 на ключевых icon-actions и mentee-pills.
- Визуально не «разъехалось» — проверить на 390px (DevTools / Claude in Chrome), особенно AdminPanel hover-группы и mentee-pill стопку.

## 8. Apply-порядок (по 🟢)
1. Доприменить выбранный scope Группы A.
2. `npm run build` зелёная; (опц.) Chrome 390px smoke.
3. `git add` целевых файлов по имени + этот док.
4. Commit `design(DESIGN-001): phase B4 — touch targets >=44px (hit-area, layout preserved)`.
5. `git push origin main`; FTP запустится; пост-деплой smoke (главная 200, свежий бандл).

## 9. Предлагаемый commit message
```
design(DESIGN-001): phase B4 — touch targets >=44px (hit-area, layout preserved)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
```
