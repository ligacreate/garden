# Recon → Propose (READ-ONLY): Garden-«Библиотека» у ментора кидает в PVL вместо CourseLibraryView

**Дата:** 2026-06-03 · **Тип:** разведка + предложение фикса. **Фикс НЕ применял** — только дифф ниже, жду ревью.
**Источник:** репо `ligacreate/garden` @ `main`. Симптом снят Claude in Chrome под ментором (не перевоспроизводил).

> TL;DR. Корень — **stale монотонный счётчик `libraryOpenRequest`** в `UserApp`, который никогда не
> сбрасывается, в паре с тем, что `CourseLibraryView` **размонтируется/монтируется** при каждом заходе в
> раздел. Эффект «открыть ПВЛ» в `CourseLibraryView` срабатывает **на каждом маунте**, пока счётчик
> truthy. Поэтому после первого входа в ПВЛ (через «Учительская»/«ПВЛ») любой последующий клик Garden-«Библиотека»
> ремонтирует вью со стухшим `openPvlRequest=1` → форсит ПВЛ-курс → меню переключается на PVL-набор. Это
> клиентский стейт, не роутинг. Фикс точечный: сбрасывать счётчик при обычном заходе в библиотеку и
> ре-бампать его только в `openPvlCourse`.

---

## 1. Карта навигации: где «Библиотека» и где переключается контекст Garden↔PVL

**Меню и вьюхи живут в `views/UserApp.jsx`** (Garden-оболочка). Левое меню имеет два набора:
- **Garden-набор** (Дашборд/Встречи/Сад ведущих/…/**Библиотека**/Учительская…) — ветка `else` рендера меню
  ([UserApp.jsx:748-855](../views/UserApp.jsx#L748)).
- **PVL-набор ментора** (Дашборд/Мои менти/Очередь/**Библиотека**/…) — ветка `isCourseSidebarMode`
  ([UserApp.jsx:~690-746](../views/UserApp.jsx#L690)), пункты приходят из `courseSidebar.items`.

**Переключатель набора** — флаг `isCourseSidebarMode = view === 'library' && courseSidebar.enabled`
([UserApp.jsx:282](../views/UserApp.jsx#L282)). `courseSidebar` ставит `CourseLibraryView` через колбэк
`onCourseSidebarChange` ([UserApp.jsx:1027](../views/UserApp.jsx#L1027)). Внутри `CourseLibraryView` он
становится `enabled:true` **только когда** `aiCampSession` есть И `selectedCourse.id === PVL_ENTRY_COURSE_ID`
([CourseLibraryView.jsx:655-666](../views/CourseLibraryView.jsx#L655)). Иначе — `enabled:false` → Garden-меню.

**«Библиотека» в Garden-меню** → `handleViewChange('library')`
([UserApp.jsx:790-792](../views/UserApp.jsx#L790), моб. [:954](../views/UserApp.jsx#L954),
нижнее таб-меню [:1133](../views/UserApp.jsx#L1133)). Это маппинг на **Garden CourseLibraryView**
(рендерится при `view==='library'`, [UserApp.jsx:1011-1031](../views/UserApp.jsx#L1011)).

**«Учительская» / «ПВЛ»** → `openPvlCourse` ([UserApp.jsx:849-855](../views/UserApp.jsx#L849),
[:832-838](../views/UserApp.jsx#L832)):
```js
const openPvlCourse = () => {
    setLibraryOpenRequest((n) => n + 1);   // (счётчик)
    handleViewChange('library');           // view='library' → CourseLibraryView mount
    setMobileMenuOpen(false);
};
```

**«Библиотека» в PVL-наборе** → проксируется в PVL-роутер (`gardenPvlBridgeRef.current.navigate('/mentor/library')`,
[UserApp.jsx:737-743](../views/UserApp.jsx#L737)) — это уже внутренняя навигация PVL по `pvlGardenNav.js:46`.

Итог карты: оба набора имеют пункт «Библиотека», но Garden-пункт обязан вести в `CourseLibraryView` (список
курсов Garden, где соц-психология), а PVL-пункт — во внутренний PVL `/mentor/library`. Контекст переключается
исключительно через `courseSidebar.enabled`, который зависит от `selectedCourse === PVL_ENTRY_COURSE_ID`.

## 2. Почему Garden-«Библиотека» у PVL-ментора форсит PVL (корневая причина)

Цепочка `setSelectedCourseId(PVL_ENTRY_COURSE_ID)` в `CourseLibraryView` ровно одна — в эффекте «открыть ПВЛ»
([CourseLibraryView.jsx:478-483](../views/CourseLibraryView.jsx#L478)):
```js
useEffect(() => {
    if (!openPvlRequest || !canSeePvlCourse) return;     // ← LEVEL-проверка, не EDGE
    setSelectedCourseId(PVL_ENTRY_COURSE_ID);
    ...
}, [openPvlRequest, canSeePvlCourse]);
```
`openPvlRequest` = проп `libraryOpenRequest` из `UserApp` ([UserApp.jsx:1023](../views/UserApp.jsx#L1023)).
Этот счётчик:
- стартует с `0`, **только инкрементится** в `openPvlCourse` ([UserApp.jsx:69,81](../views/UserApp.jsx#L69)),
- **нигде не сбрасывается** (проверено: единственный `setLibraryOpenRequest` — это `n => n+1`).

`CourseLibraryView` рендерится **условно** (`{view === 'library' && <CourseLibraryView/>}`,
[UserApp.jsx:1011](../views/UserApp.jsx#L1011)) → при уходе из библиотеки **размонтируется**, при возврате —
**монтируется заново**. На свежем маунте React **выполняет эффект один раз**. Если к этому моменту
`openPvlRequest` уже `≥1` (truthy, остался от прошлого входа в ПВЛ), `if (!openPvlRequest …)` **не** делает
ранний выход → `setSelectedCourseId(PVL_ENTRY_COURSE_ID)` → embedded PVL → `courseSidebar.enabled=true` → меню
переключается на PVL-набор. У ментора `canSeePvlCourse=true` (`resolvePvlRoleFromGardenProfile`='mentor',
`canSeePvlInGarden`=true, [services/pvlRoleResolver.js:20,27](../services/pvlRoleResolver.js#L20)) — guard не спасает.

**Точная последовательность бага (воспроизводит симптом 1:1):**
1. Ментор жмёт «Учительская» → `openPvlCourse`: `libraryOpenRequest 0→1`, `view='library'`. `CourseLibraryView`
   монтируется, эффект видит `openPvlRequest=1` → ПВЛ. *(штатно)*
2. Ментор «Вернуться в сад» → `view='dashboard'`, `CourseLibraryView` **размонтируется**.
   `libraryOpenRequest` **остаётся = 1**.
3. Ментор жмёт Garden-«Библиотека» → `handleViewChange('library')` (бампает только `libraryResetToken`,
   [UserApp.jsx:242-243](../views/UserApp.jsx#L242), `libraryOpenRequest` **не трогает**) → `view='library'` →
   `CourseLibraryView` **монтируется заново** с `openPvlRequest=1` → эффект **снова** форсит
   `PVL_ENTRY_COURSE_ID` → PVL-меню + PVL «Библиотека курса». **Garden CourseLibraryView не открывается.** ⛔

Это объясняет и «повторный клик снова кидает в PVL»: счётчик так и сидит на `1`. Первый-первый клик
(до любого входа в ПВЛ, `libraryOpenRequest=0`) отрабатывает корректно — список курсов; баг проявляется
только ПОСЛЕ первого входа в ПВЛ.

**Нет роль-гарда «форсить ПВЛ-ментора в PVL» как такового** — есть stale-счётчик, который на ремаунте
читается как «запрос открыть ПВЛ». `aiCampSession` (из `localStorage`) сам по себе ПВЛ **не** открывает
(единственный `setSelectedCourseId(PVL)` — через `openPvlRequest`), поэтому чинить надо счётчик, а не сессию.

## 3. Подтверждение: доведя до Garden CourseLibraryView, ментор увидит соц-психологию

Да. Карточка курса «Социальная психология» (id 7, `minRole: APPLICANT`, `hideWhenEmpty: true`,
[CourseLibraryView.jsx:79-87](../views/CourseLibraryView.jsx#L79)) попадает в `availableCourses`, если
`materialsCount("Социальная психология") > 0` ([:383-400](../views/CourseLibraryView.jsx#L383)). Счёт идёт по
`knowledgeBase.filter(k => k.role==='all' || hasAccess(role, k.role))` ([:386-391](../views/CourseLibraryView.jsx#L386)).
По recon `_178`: в `knowledge_base` 7 статей соц-психологии с `role='all'` → считаются всем → `7 > 0` → карточка
видна. `minRole` тоже не режет: `hasAccess(mentor=level3, APPLICANT=level0)=true`
([utils/roles.js:27-29](../utils/roles.js#L27)). Материалы (`role='all'`) рендерятся для ментора без ограничений.
→ После фикса: Garden-«Библиотека» → список курсов → карточка «Социальная психология» (1 клик) → 7 статей. **Контент в PVL не дублируем.**

---

## 4. Предлагаемый ТОЧЕЧНЫЙ фикс (НЕ применён)

Цель: Garden-«Библиотека» открывает Garden `CourseLibraryView` (список курсов); «Учительская»/«ПВЛ» по-прежнему
открывают ПВЛ; оба набора меню целы. Минимально — **2 правки в одном файле `views/UserApp.jsx`**, ничего в
`CourseLibraryView`. Идея: `libraryOpenRequest` должен на момент маунта означать «нужен ли ПВЛ» (truthy только
когда явно просили ПВЛ). Значит — сбрасывать его при обычном заходе в библиотеку и ре-бампать в `openPvlCourse`
ПОСЛЕ сброса.

**Правка A — `handleViewChange`, ветка library** ([UserApp.jsx:242-243](../views/UserApp.jsx#L242)):
```diff
         if (newView === 'library') {
             setLibraryResetToken((v) => v + 1);
+            // Обычный заход в библиотеку (Garden-пункт «Библиотека») должен показать
+            // список курсов Garden, а не реанимировать ПВЛ из stale-счётчика на ремаунте.
+            // openPvlCourse ниже ре-бампает этот счётчик ПОСЛЕ handleViewChange.
+            setLibraryOpenRequest(0);
         } else if (newView === 'builder') {
```

**Правка B — `openPvlCourse`** ([UserApp.jsx:80-84](../views/UserApp.jsx#L80)):
```diff
     const openPvlCourse = () => {
-        setLibraryOpenRequest((n) => n + 1);
-        handleViewChange('library');
+        // Порядок важен: handleViewChange('library') сбрасывает libraryOpenRequest в 0,
+        // поэтому инкремент идёт ПОСЛЕ — иначе ПВЛ не откроется.
+        handleViewChange('library');
+        setLibraryOpenRequest((n) => n + 1);
         setMobileMenuOpen(false);
     };
```

**Почему корректно (композиция функциональных апдейтов в одном батче):**
- Garden-«Библиотека»: `handleViewChange('library')` → `setLibraryOpenRequest(0)`. Итог на маунте `0` →
  `CourseLibraryView` показывает **список курсов**. ✅
- «Учительская»/«ПВЛ»: `handleViewChange('library')` ставит `0`, затем `setLibraryOpenRequest(n=>n+1)` читает
  пост-значение `0` → `1`. Итог `1` → **ПВЛ открывается**. ✅
- «Учительская» когда уже на списке (без ремаунта): `openPvlRequest` меняется `0→1` → эффект
  ([:478](../views/CourseLibraryView.jsx#L478)) срабатывает по смене зависимости → ПВЛ. ✅
- Garden-«Библиотека» когда уже в ПВЛ: `libraryResetToken++` (→ `selectedCourseId=null`) + `openPvlRequest 1→0`
  (эффект делает ранний выход) → список; `courseSidebar` отключается → Garden-меню возвращается. ✅

Никакие другие вызовы `handleViewChange('library')` (onBackToGarden, exit_pvl) ПВЛ не открывают — они и должны
вести в список/домой, что фикс сохраняет.

### Альтернатива (если ревью не любит зависимость от порядка setState)
Заменить счётчик на явный булев интент `pvlOpenIntent` (true в `openPvlCourse`, false в ветке library
`handleViewChange`), проп `openPvlRequest={pvlOpenIntent}`. Семантика та же, но «последняя запись побеждает»
для булева очевиднее, чем композиция функциональных апдейтов счётчика. Чуть больше дифф (переименование стейта).
Рекомендую основной вариант (2 правки) как минимальный.

## 5. Тест-план для верификации (после применения, отдельной сессией)
1. Свежий вход ментором → Garden-«Библиотека» (до ПВЛ): открывается список курсов, видна «Социальная психология». 
2. «Учительская» → ПВЛ-меню + PVL «Библиотека курса» (штатно). 
3. «Вернуться в сад» → Garden-меню. 
4. **Повторно Garden-«Библиотека» → список курсов Garden (НЕ ПВЛ)** — главный кейс регрессии. 
5. Открыть «Социальная психология» → 7 статей рендерятся. 
6. Регресс «Учительская» ещё раз → ПВЛ снова открывается. 
7. Моб. таб-меню «Библиотека» ([:1133](../views/UserApp.jsx#L1133)) — те же шаги (идёт через тот же `handleViewChange`).

**Фикс НЕ применял. Жду ревью.**
