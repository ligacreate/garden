# UX-TG-TG-LINK-ANGLE-BRACKETS-CONFUSING — fix

**Файл:** `garden/views/ProfileView.jsx` (~847-853)
**Тикет:** UX-TG-LINK-ANGLE-BRACKETS-CONFUSING
**Дата:** 2026-05-26

## Rationale

Дарья Старостина 26.05 при привязке Telegram буквально скопировала пример команды с угловыми скобками `/start <код>` и отправила боту `/start <LINK-Y97NM8>`. Бот не понял синтаксис — placeholder `<код>` был воспринят пользователем как часть команды.

Источник проблемы: инструкция в `ModalShell` для `tgLinkModal` показывала шаблон команды с placeholder-скобками, при этом реальный код пользователя был в отдельном code-боксе ниже. Дарья не сделала ментальный шаг подстановки.

## Решение

Подставить реальный `{tgLinkModal?.code}` прямо в строку команды и убрать упоминание копирования из текста инструкции — теперь команду можно copy-paste целиком из самой инструкции.

Code box с copy-кнопкой ниже **сохранён** — он даёт quick-copy только кода (без префикса `/start`), что полезно если бот уже принял `/start` ранее и просит только код.

## Diff

```diff
-                        <p className="text-sm text-slate-600 mb-3">
-                            Шаг 2. Если бот не открылся автоматически — скопируйте код и отправьте боту командой <code className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-700">/start &lt;код&gt;</code>:
-                        </p>
-                        <div className="flex items-center gap-2">
+                        <p className="text-sm text-slate-600 mb-3">
+                            Шаг 2. Если бот не открылся автоматически — отправьте боту командой:
+                        </p>
+                        <div className="bg-slate-100 px-3 py-2 rounded font-mono text-sm text-slate-800 mb-3 select-all">
+                            /start {tgLinkModal?.code || 'КОД'}
+                        </div>
+                        <div className="flex items-center gap-2">
```

## Изменения

- Убраны слова «скопируйте код и» — лишний шаг, теперь команда уже содержит код
- `&lt;код&gt;` → `{tgLinkModal?.code || 'КОД'}` (реальный код, fallback на «КОД» если modal только открывается)
- Команда вынесена на отдельную строку (block, не inline `<code>`) с `select-all` — тап выделяет всю команду
- Fallback `'КОД'` (не пустая строка) — на случай race condition при открытии modal, чтобы layout не схлопывался

## Commit

⏳ Жду 🟢 от стратега.
