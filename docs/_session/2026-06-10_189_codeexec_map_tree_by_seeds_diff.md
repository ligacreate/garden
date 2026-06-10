# 189 · codeexec → стратег · Дерево в «Саду» растёт по семенам (вариант A)

## 1. TL;DR
Фикс: в режиме «Сад» ([MapView](../../views/MapView.jsx)) front-face карточки рисовал дерево
**по времени** (`LivingTree` друид/level от `join_date`). Теперь рисует **по семенам** —
7 стадий, картинки `/trees/tree-N.png`, как в «Мой сад» ([StatsDashboardView](../../views/StatsDashboardView.jsx)).

Пороговая логика вынесена в общий util [utils/treeStages.js](../../utils/treeStages.js) (дедуп 1:1),
оба экрана импортят оттуда.

- Статус: **написан локально, `npm run build` ✓ (3.60s, без ошибок)**.
- `displayUser.seeds` на карте **подтверждён доступен** (см. §5).
- Имя-лейбл с друид-деревом (`treeName`) **не тронут** — только визуал дерева.

## 2. Дизайн-решения
- **Единый источник правды.** `getTreeStage` был приватной функцией внутри `StatsDashboardView`.
  Вынес в `utils/treeStages.js` **строго 1:1** (без `Number()`-коэрции и прочей отсебятины) —
  в обоих call-site `seeds` уже число с дефолтом `0`.
- **Убрал time-level.** `isNew`/`level` (дерево < 30 дней → саженец, иначе взрослое) удалены
  целиком — это и был баг «растёт по времени».
- **`<img>` вместо `LivingTree`.** Front-face — простой `<img object-cover>` в круглом
  контейнере `w-32 h-32` (как было у LivingTree-обёртки). `object-cover` заполняет круг
  без полей. `alt={stage.name}` для доступности.
- **`LivingTree.jsx` не удаляю** — компонент остаётся в `components/`, просто больше не
  импортируется из MapView. Вне scope задачи.

## 3. Полный diff

### 3.1 NEW — `utils/treeStages.js`
```diff
+// Стадии роста дерева в Саду — единый источник правды.
+// Дерево растёт ПО СЕМЕНАМ (не по времени): 7 стадий, картинки /trees/tree-N.png.
+// Используется в StatsDashboardView (мой сад) и MapView (режим «Сад»).
+export const getTreeStage = (s) => {
+    if (s < 150) return { name: 'Семечко', next: 150, image: '/trees/tree-1.png' };
+    if (s < 500) return { name: 'Росток', next: 500, image: '/trees/tree-2.png' };
+    if (s < 1500) return { name: 'Саженец', next: 1500, image: '/trees/tree-3.png' };
+    if (s < 3500) return { name: 'Молодое дерево', next: 3500, image: '/trees/tree-4.png' };
+    if (s < 7000) return { name: 'Крепкое дерево', next: 7000, image: '/trees/tree-5.png' };
+    if (s < 12000) return { name: 'Раскидистое дерево', next: 12000, image: '/trees/tree-6.png' };
+    return { name: 'Плодоносящее дерево', next: 100000, image: '/trees/tree-7.png' };
+};
```

### 3.2 `views/StatsDashboardView.jsx` — импорт из util, удаление локальной копии
```diff
 import { getDruidTree } from '../utils/druidHoroscope';
+import { getTreeStage } from '../utils/treeStages';
 import { getTenureParts } from '../utils/tenure';
@@
     const druidTree = getDruidTree(user.dob);
-
-    const getTreeStage = (s) => {
-        if (s < 150) return { name: 'Семечко', next: 150, image: '/trees/tree-1.png' };
-        if (s < 500) return { name: 'Росток', next: 500, image: '/trees/tree-2.png' };
-        if (s < 1500) return { name: 'Саженец', next: 1500, image: '/trees/tree-3.png' };
-        if (s < 3500) return { name: 'Молодое дерево', next: 3500, image: '/trees/tree-4.png' };
-        if (s < 7000) return { name: 'Крепкое дерево', next: 7000, image: '/trees/tree-5.png' };
-        if (s < 12000) return { name: 'Раскидистое дерево', next: 12000, image: '/trees/tree-6.png' };
-        return { name: 'Плодоносящее дерево', next: 100000, image: '/trees/tree-7.png' };
-    };
     const stage = getTreeStage(seeds);
```
(остальное в StatsDashboardView не тронуто — `stage.image`/`stage.name` используются как раньше)

### 3.3 `views/MapView.jsx` — импорты
```diff
-import { getRoleLabel, getSeason } from '../data/data';
+import { getRoleLabel } from '../data/data';
 import { getDruidTree } from '../utils/druidHoroscope';
+import { getTreeStage } from '../utils/treeStages';
 import { normalizeSkills } from '../utils/skills';
 import { getTenureText } from '../utils/tenure';
-import LivingTree from '../components/LivingTree';
```
> `getSeason` импортировался **только** ради `LivingTree` — убран. `getRoleLabel` остаётся
> (роль-лейбл). `getDruidTree` остаётся (вычисление `treeName` для текст-лейбла).

### 3.4 `views/MapView.jsx` — убран time-level, добавлена стадия по семенам
```diff
                                     const displayUser = (currentUser && user.id === currentUser.id) ? { ...user, ...currentUser } : user;
-                                    // Determine tree level roughly by role or time (simplified to adult for now for helpers, sprout for newbies)
-                                    const isNew = displayUser.join_date && (new Date() - new Date(displayUser.join_date) < 1000 * 60 * 60 * 24 * 30);
-                                    const level = isNew ? 1 : 3;
+                                    // Дерево растёт ПО СЕМЕНАМ (единый util getTreeStage), а не по времени.
+                                    const treeStage = getTreeStage(displayUser.seeds || 0);

                                     // Resolve tree name safely
```

### 3.5 `views/MapView.jsx` — front-face: `<img>` вместо `<LivingTree>`
```diff
-                                                    {/* Front Face: Tree */}
-                                                    <div className="absolute inset-0 [backface-visibility:hidden] bg-white/40 rounded-full border border-white/60 shadow-sm flex items-center justify-center overflow-hidden">
-                                                        <div className="w-full h-full">
-                                                            <LivingTree
-                                                                treeName={treeName}
-                                                                season={getSeason()}
-                                                                level={level}
-                                                            />
-                                                        </div>
-                                                    </div>
+                                                    {/* Front Face: Tree (по семенам, картинка стадии роста) */}
+                                                    <div className="absolute inset-0 [backface-visibility:hidden] bg-white/40 rounded-full border border-white/60 shadow-sm flex items-center justify-center overflow-hidden">
+                                                        <img
+                                                            src={treeStage.image}
+                                                            alt={treeStage.name}
+                                                            className="w-full h-full object-cover"
+                                                        />
+                                                    </div>
```

## 4. Что НЕ затронуто
- **Имя-лейбл `treeName`** (название друид-дерева) — текст под карточкой, остался как есть
  (строки label: имя / роль / `treeName`-чип). `getDruidTree`-fallback тоже на месте.
- **Back-face** (аватар / placeholder) — без изменений.
- **Flip-эффект**, размеры контейнера (`w-32 h-32`), фильтры, сетка «Сада» — без изменений.
- **`components/LivingTree.jsx`** — файл оставлен (просто больше не используется в MapView).
- **StatsDashboardView** визуально не меняется (та же логика, тот же `stage`).

## 5. Подтверждение `displayUser.seeds` на карте
- `MapView` получает `users` пропом. Список грузится через
  [`dataService.getUsers()`](../../services/dataService.js#L1594) → `.map(p => this._normalizeProfile(p))`.
- [`_normalizeProfile`](../../services/dataService.js#L2784) всегда отдаёт `seeds: data.seeds || 0`.
- `displayUser = {...user, ...currentUser}` (для своей карточки) или `user` — в обоих случаях
  `seeds` есть. Доп. `|| 0` в `getTreeStage(displayUser.seeds || 0)` — страховка для mock/edge.
- Итог: у каждого без семян → `< 150` → tree-1 «Семечко». Регрессии «пустого дерева» нет.

## 6. Edge-case'ы
- `seeds === 0` / `undefined` → `|| 0` → Семечко (tree-1). ✓
- Картинки `/trees/tree-1..7.png` — все 7 есть в `public/trees/` (build их копирует в `dist/`). ✓
- Большие `seeds` (≥12000) → tree-7. ✓
- `treeName` всё ещё считается (нужен для текст-чипа) — `getDruidTree` импорт сохранён. ✓

## 7. Apply-порядок (после 🟢)
1. `git add views/MapView.jsx views/StatsDashboardView.jsx utils/treeStages.js docs/_session/2026-06-10_189_codeexec_map_tree_by_seeds_diff.md`
2. Commit (см. §8).
3. `git push origin main` (CI → FTP-деплой сам).

## 8. Предлагаемый commit message
```
fix(garden): дерево в «Саду» растёт по семенам, а не по времени

MapView front-face рисовал LivingTree с level по join_date (< 30 дней →
саженец). Теперь — <img> стадии роста по seeds (7 стадий /trees/tree-N.png),
как в StatsDashboardView.

Пороговую логику getTreeStage вынес в utils/treeStages.js (единый источник),
StatsDashboardView импортит оттуда (дедуп 1:1). Убрана time-level логика
(isNew/level) и неиспользуемые импорты getSeason/LivingTree из MapView.

displayUser.seeds приходит из getUsers()→_normalizeProfile (seeds||0),
доступен для всех карточек.
```
