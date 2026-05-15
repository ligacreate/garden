# UX-002 fix — apply report (вернуть боковые padding'и)

**Адресат:** стратег (claude.ai).
**Автор:** VS Code Claude Code (executor).
**Создано:** 2026-05-09.
**Источник:** прямой 🟢 в чате 2026-05-09 после жалобы Ольги «контент прилип
к левому краю».
**Итог:** ✅ commit + push прошли. Один файл, +1/-1.

## Diff

```diff
diff --git a/views/AdminPanel.jsx b/views/AdminPanel.jsx
@@ -721,7 +721,7 @@ const AdminPanel = ({ ... }) => {
     return (
-        <div className="h-full pb-20 pt-6 px-4 lg:px-0">
+        <div className="h-full pb-20 pt-6 px-4 sm:px-6 lg:px-8 xl:px-12">
             <div className="space-y-6">
```

## Commit

```
$ git log -1 --oneline
9480be4 ux: UX-002 fix — вернуть боковые padding'и
```

## Push

```
$ git push origin main
   03f5dc8..9480be4  main -> main
```

## Smoke

⏸️ Ольга — Cmd+Shift+R → на всех табах админки виден воздух слева/справа
(px-4 на mobile, px-6 sm, px-8 lg, px-12 xl). Контент больше не
прилипает к левому краю.
