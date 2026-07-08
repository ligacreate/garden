# PVL Diff #4 — удаление орфан-вью (гигиена) (codeexec → стратег)

Дата: 2026-07-08. Статус: **удаление подготовлено в рабочем дереве, build EXIT=0, жду 🟢 перед деплоем.**
Последний пункт очереди. Согласовано Ольгой («орфаны — потом, гигиена»).

## Что удаляю (2 файла, −941 строк)
- `views/PvlStudentCabinetView.jsx` (736 строк) — мок-кабинет ученика. Живой кабинет = `StudentDashboard` в `PvlPrototypeApp.jsx` (Diff #1). Открытие [207] показало: файл нигде не роутится/не импортируется.
- `views/MentorDashboardView.jsx` (205 строк) — орфан-дашборд ментора. Живой путь ментора = `/mentor/dashboard` + карточка менти в `PvlPrototypeApp.jsx`.

## Почему безопасно (проверено)
- `grep` по всему репо (кроме node_modules/dist): **ни один файл не импортирует** ни `PvlStudentCabinetView`, ни его именованные экспорты (`studentProfile`, `dashboardStats`, `courseWeeks`, `resultItems`, `libraryItems`, `mentorPractices`, `faqItems`, `statusBadge`, `progressWidget`), ни `MentorDashboardView`. exit=1 (0 совпадений) на всех.
- `MentorDashboardView` сам импортировал `PvlMenteeCardView` — удаление убирает лишнего потребителя, ничего не ломает.
- `npx vite build` после удаления — **EXIT=0**.

## Не трогаю
- Общий компонент `PvlMenteeCardView` (живой, используется в проде) — остаётся.
- Никакой логики; только удаление двух неиспользуемых экранов.

Жду 🟢 → коммичу удаление и пушу (dist не коммичу). Откат тривиален (git revert).
