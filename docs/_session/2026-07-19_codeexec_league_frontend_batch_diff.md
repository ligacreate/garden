# DIFF-ON-REVIEW (batch) — «Сценарии лиги»: общий инфоблок + per-scenario usage_note

**Дата:** 2026-07-19
**Автор:** codeexec (VS Code)
**Статус:** 🟡 ЖДЁТ 🟢 (фронт, одно окно; коммит без push до окна)
**Файл:** `views/BuilderView.jsx`
**БД:** колонка `usage_note` + фил id 26 — уже применены на прод (см. `2026-07-19_codeexec_usage_note_migration_apply_report.md`). Фронт катим ПОСЛЕ (колонка есть → PATCH/POST не упадут, но здесь мы и не пишем).
**Заменяет:** `2026-07-19_codeexec_league_scenarios_ip_notice_diff.md` (тот инфоблок вошёл сюда п.2).

## Состав батча
1. Импорт иконки `Info`.
2. **Общий инфоблок** (IP-уведомление) над сеткой — дефолт для всех (текст дословно).
3. **Per-scenario `usage_note`** — заметный блок под названием сценария, в ДВУХ местах: карточка сетки + просмотр (DocumentPreviewModal).

Данные текут сами: `getPublicScenarios()` = `select:'*'` → `s.usage_note` доступен в карточке и в объекте просмотра. Сериализатор не трогаем (read-only рендер).

---

## 1. Импорт — строка 3
```diff
- ... GripVertical, PenLine, Upload } from 'lucide-react';
+ ... GripVertical, PenLine, Upload, Info } from 'lucide-react';
```

## 2. Общий инфоблок над сеткой — таб `league` (сейчас строки 1145–1151)
Первым ребёнком контейнера, выше «Прогресс…» и выше `<ScenarioList>`:
```diff
                ) : (
                    <div className="flex-1 overflow-y-auto animate-in fade-in duration-300">
+                       {leagueScenarios.length > 0 && (
+                           <div className="mb-5 flex items-start gap-3 bg-slate-100 border border-slate-200 rounded-2xl px-5 py-4">
+                               <Info size={18} className="text-slate-400 shrink-0 mt-0.5" />
+                               <div className="text-sm text-slate-600 leading-relaxed space-y-2">
+                                   <p>Сценарии этого раздела являются интеллектуальной собственностью ведущих Лиги и распространяются в учебных целях в качестве примера.</p>
+                                   <p>Использование данных сценариев возможно лишь частично в формате идей и отдельных практик, без полного повторения сценария, и предполагает обязательное упоминание имени ведущей.</p>
+                               </div>
+                           </div>
+                       )}
                        {leagueScenarios.length > 0 && (
                            <div className="mb-4 text-xs text-slate-500">
                                Прогресс: изучено {completedLeagueScenariosCount} из {leagueScenarios.length}
                            </div>
                        )}
                        <ScenarioList scenarios={leagueScenarios} variant="league" ... />
```
Стиль: нейтральный slate (не алерт). Текст дословный, две фразы → два `<p>` (space-y-2). Ничего не срезано.

## 3a. usage_note в карточке — `ScenarioList`, сразу под `<h3>` (после строки 504)
```diff
                        <h3 className="font-medium text-lg text-slate-800 mb-2 group-hover:text-blue-600 transition-colors line-clamp-2">{s.title || 'Без названия'}</h3>
+                       {variant === 'league' && s.usage_note && (
+                           <div className="mb-3 flex items-start gap-2 bg-blue-50 border border-blue-100 rounded-2xl px-3 py-2.5">
+                               <Info size={15} className="text-blue-600 shrink-0 mt-0.5" />
+                               <div className="text-xs text-slate-600 leading-relaxed">
+                                   <div className="text-[10px] uppercase tracking-wider text-blue-700 font-bold mb-0.5">Как использовать</div>
+                                   {s.usage_note}
+                               </div>
+                           </div>
+                       )}
                        {variant !== 'league' && ( ...дата/практики... )}
```
Акцент blue (в палитре = лесной зелёный) — «разрешительная» заметка автора, визуально отделена от нейтрального IP-инфоблока.

## 3b. usage_note в просмотре — `DocumentPreviewModal`
**b1. сигнатура (строка 198)** — добавить проп `usageNote`:
```diff
- const DocumentPreviewModal = ({ type, timeline, title, user, onClose, onNotify, extraAction, materialContentHtml }) => {
+ const DocumentPreviewModal = ({ type, timeline, title, user, onClose, onNotify, extraAction, materialContentHtml, usageNote }) => {
```
**b2. рендер (после title-блока, строки 359–362), ВНУТРИ `#preview-export-content`** — чтобы заметка попала и в PDF:
```diff
                                <div className="mb-6 border-b border-slate-100 pb-4">
                                    <div className="text-xs uppercase tracking-wider text-slate-400">Сценарии лиги</div>
                                    <div className="text-2xl font-medium text-slate-900">{title || 'Без названия'}</div>
                                </div>
+                               {usageNote && (
+                                   <div className="mb-6 flex items-start gap-3 bg-blue-50 border border-blue-100 rounded-2xl px-5 py-4">
+                                       <Info size={18} className="text-blue-600 shrink-0 mt-0.5" />
+                                       <div className="text-sm text-slate-700 leading-relaxed">
+                                           <div className="text-[10px] uppercase tracking-wider text-blue-700 font-bold mb-1">Как использовать этот сценарий</div>
+                                           {usageNote}
+                                       </div>
+                                   </div>
+                               )}
                                <div className="prose prose-slate ..." dangerouslySetInnerHTML={{ __html: materialContentHtml ... }} />
```
**b3. проброс пропа (league preview, строки 1164–1185)**:
```diff
                    title={leaguePreviewScenario.title}
+                   usageNote={leaguePreviewScenario.usage_note}
                    user={user}
```

---

## 🟡 Judgment calls (нужно решение с 🟢)
- **JC-A — кикер «Как использовать».** Придумал заголовок над текстом заметки, чтобы отделить её от названия и материала. Ок? Варианты: «Как использовать» / «От автора» / без кикера (только иконка+текст).
- **JC-B — акцент цвет.** usage_note = blue-акцент (зелёный), IP-инфоблок = нейтральный slate. Согласен с разделением тонов?
- **JC-C (перенос из прошлого диффа) — место общего инфоблока.** Дефолт: инфоблок → «Прогресс…» → сетка. Ок?
- **JC-D — usage_note в PDF.** Кладу заметку внутрь `#preview-export-content` → она уедет и в PDF-экспорт сценария. Считаю правильным (разрешение автора путешествует с материалом). Если нет — вынесу блок за пределы export-node.

## План верификации (после 🟢 apply)
1. `npm run build` — чисто.
2. Таб «Сценарии лиги»: общий инфоблок над карточками; у карточки id 26 — блок «Как использовать» под названием; у остальных 8 — нет.
3. Открыть просмотр id 26 → блок «Как использовать этот сценарий» под названием, над материалом; у других — нет.
4. PDF id 26 → заметка присутствует (или отсутствует, если решим JC-D иначе); html2canvas-pro без регресса.
5. Мобильный: flex не ломается, текст читаем.

## Выкат
Чистый фронт → коммит (миграция+data+фронт+session-доки одним батчем) **без push** → push в согласованное окно (GitHub Actions → FTP на liga, окно 403 ожидаемо). Колонка на проде уже есть.
