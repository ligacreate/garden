# Оптимизация bundle и скорости загрузки

**Создано:** 2026-05-09.
**Триггер:** Ольга жалуется на медленную загрузку сайта.
**Статус:** план, не начат.

## Проблема

На текущем production-билде main-bundle весит **1,332 KB / 392 KB
gzip**. Vite ругается warning'ом «Some chunks are larger than 500 kB
after minification». При первом заходе (или после Cmd+Shift+R) браузер
тянет почти 400 KB JS до того как покажет хоть что-то.

В main bundle статически импортируются view'ы и сервисы, которые нужны
не всем пользователям и не сразу:

| Файл | Строк | Кому реально нужен сразу |
|---|---|---|
| `views/AdminPanel.jsx` | 1623 | только admin |
| `views/BuilderView.jsx` | 1184 | при работе со сценариями (тащит `jspdf` + `html2canvas`) |
| `views/MeetingsView.jsx` | 1738 | по клику в сайдбаре |
| `views/PracticesView.jsx` | 776 | по клику в сайдбаре |
| `views/MarketView.jsx`, `MapView.jsx`, `CRMView.jsx` | <500 каждая | по клику |
| `views/LeaderPageView.jsx`, `CommunicationsView.jsx` | <500 каждая | по клику |

Дополнительно build-варнинг подсказывает дырку:

```
html2canvas dynamically imported by jspdf + LeaderPageView,
но ALSO statically imported by BuilderView.jsx →
dynamic import will not move module into another chunk.
```

То есть один статический импорт в `BuilderView` перечёркивает усилия
по lazy-загрузке html2canvas в других местах.

## Цель

Main bundle ≤ 500 KB / ≤ 150 KB gzip. Initial Time-To-Interactive
сокращён минимум вдвое для не-админских ролей и для пользователей,
которые сразу не идут в Builder.

## Фазы

### [ ] Фаза 1 — замер baseline

- `npx vite build`, записать в plan размеры main + всех code-split chunks.
- Открыть https://liga.skrebeyko.ru в Chrome, DevTools → Network →
  Disable cache → Cmd+Shift+R, записать TTFB / DOMContentLoaded /
  Largest Contentful Paint.
- Lighthouse для главной страницы (мобильный профиль), записать
  Performance score.

### [ ] Фаза 2 — lazy AdminPanel

Самый жирный gain. AdminPanel грузится у всех при инициализации
`App.jsx`, хотя нужен только админу (1% пользователей).

- В `App.jsx` заменить `import AdminPanel from './views/AdminPanel'`
  на `const AdminPanel = lazy(() => import('./views/AdminPanel'))`.
- Обернуть рендер в `<Suspense fallback={...}>` (паттерн как у
  `CourseLibraryView` в `UserApp.jsx:944-963`).
- Build, проверить что AdminPanel ушёл в отдельный chunk.

### [ ] Фаза 3 — lazy BuilderView + чистка html2canvas

- Сделать `BuilderView` lazy в `UserApp.jsx`.
- Убрать статический `import` html2canvas в `BuilderView.jsx`,
  оставить только динамический. Vite-варнинг про конфликт пропадёт —
  jspdf и BuilderView оба будут lazy-загружать html2canvas.
- Smoke: открыть Builder, попробовать экспорт PDF — html2canvas
  должен подтянуться при клике, а не при initial load.

### [ ] Фаза 4 — lazy остальные view

- `MeetingsView`, `PracticesView`, `MarketView`, `MapView`, `CRMView`,
  `LeaderPageView`, `CommunicationsView` → lazy.
- Каждая view — `<Suspense fallback={...}>` обёртка единообразная
  (вынести в общий компонент `<ViewLoading />`).
- Smoke по каждому табу — переход через сайдбар должен работать,
  fallback видим только при первом заходе на таб.

### [ ] Фаза 5 — manualChunks для общих deps

Если после фаз 2-4 main всё ещё > 500 KB — настроить
`build.rollupOptions.output.manualChunks` в `vite.config.js`:

- `react-vendor` (react, react-dom).
- `lucide` (lucide-react — используется почти везде, имеет смысл
  отдельным chunk'ом для долгоживущего кэша).
- `db-services` (`dataService.js` + `pvlPostgrestApi.js`).

### [ ] Фаза 6 — повторный замер

- Те же метрики что в Фазе 1: размер main, gzip, TTI, Lighthouse.
- В план записать «было / стало».
- Если цель не достигнута — Фаза 7 (анализ что ещё держит main).

## Риски и не-цели

- **Не-цель:** менять структуру компонентов или их API. Это чисто
  organisational refactor — какие модули в каких chunk'ах.
- **Риск:** lazy-импорт ломает порядок загрузки если view ожидает
  что какой-то контекст инициализирован. Минимизируется тем что все
  обёрнуты в `<Suspense>` с явным fallback.
- **Риск:** code-split chunks с одинаковым contenthash при первой
  раскатке могут залипать в browser cache (Vite ставит
  `Cache-Control: immutable`). После релиза попросить тестеров
  сделать hard reload один раз.

## Связанные тикеты

- Логически независим от FEAT-016, можно делать после стабилизации.
- Делается в одной ветке — каждая фаза = коммит с отдельным
  «было/стало» в commit message.

## Итоговый блок

Не начат.
