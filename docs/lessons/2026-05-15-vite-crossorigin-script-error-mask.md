# BUG-CORS-SCRIPT-ERROR — «Script error.» без stack из-за Vite crossorigin

**Дата:** 2026-05-15
**Где всплыло:** TG-мониторинг `@garden_grants_monitor_bot`. ~70%
ошибок приходило как «Script error.» без message/filename/lineno/stack.
**Тип:** дырявый build-output дизайн, не bug в коде приложения.

## Симптом

В TG `🚨 Garden client error / Script error.` без stack.
В Sentry-подобной модели — это полностью бесполезные алерты:
не знаем, какая ошибка, в каком файле, какая роль пользователя.

## Postmortem: первый фикс не сработал

**Первая гипотеза (частично верная):** Vite ставит `crossorigin="anonymous"`
на `<script type="module">` и `<link rel="modulepreload">`, что
включает CORS-режим. Браузер требует от сервера
`Access-Control-Allow-Origin` header. Без него модуль маркируется
как opaque, и `window.onerror` получает обобщённое «Script error.»
вместо реальной информации.

**Первая попытка фикса:** добавили в `dist/.htaccess` блок:
```apache
<FilesMatch "\.(js|mjs|css)$">
    <IfModule mod_headers.c>
        Header set Access-Control-Allow-Origin "*"
    </IfModule>
</FilesMatch>
```

**Не сработало.** Проверка `curl -I https://liga.skrebeyko.ru/`:
- Header `X-Htaccess-Active: yes` (sentinel из того же файла) **отсутствует**.
- ACAO header **отсутствует**.

**Почему мимо:** хостинг Timeweb работает на чистом **nginx**, без
проксирования через Apache. nginx **не читает** `.htaccess` —
никогда. Никакие правила оттуда не применяются. Файл просто лежит
рядом с index.html и доступен публично (см. INFRA-HTACCESS-PUBLIC P3).

## Корневая причина

Vite по умолчанию ставит `crossorigin="anonymous"` на module-scripts
и modulepreload-links — это разумно для CDN-deployment (когда static
живёт на отдельном домене), но **избыточно** для same-origin
deployment'а (наш bundle на том же `liga.skrebeyko.ru` что и
страница). Именно атрибут включает CORS-режим — без него браузер
делает обычный same-origin fetch, и весь stack/source доступен в
`window.onerror` без всяких ACAO заголовков.

## Как починили (реально)

Inline Vite-плагин в `vite.config.js` с `transformIndexHtml`
hook (`enforce: 'post'`). Снимает `crossorigin` атрибут с тегов,
у которых `src`/`href` начинается с `/` (= same-origin относительный
путь). Внешние ресурсы (`<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>`)
сохраняют `crossorigin` — там он легитимен для CORS prefetch шрифтов.

```js
const removeCrossoriginSameOrigin = () => ({
  name: 'remove-crossorigin-same-origin',
  enforce: 'post',
  transformIndexHtml(html) {
    return html.replace(/<(script|link)\s[^>]+>/g, (tag) => {
      if (/\s(?:src|href)="\/[^"]*"/.test(tag)) {
        return tag.replace(/\s+crossorigin(="[^"]*")?/g, '');
      }
      return tag;
    });
  },
});
```

**Плюсы подхода:**
- 100% контроль на build-стадии, не зависит от хостинга/панели Timeweb.
- 0 регрессий: same-origin загрузка работает без всяких CORS-заголовков.
- Внешние ресурсы (fonts.gstatic.com) сохраняют crossorigin — поведение
  не задето.
- Никаких внешних зависимостей.

**Связанные слои:** удалили из `public/.htaccess` блок CORS — он всё
равно не применялся. Cache-блоки оставлены в .htaccess как
meta-fallback / документация желаемого поведения (на проде кэширование
работает через nginx-конфиг Timeweb или через `<meta http-equiv>` в
index.html).

## Verify

- `npm run build` → `grep -c crossorigin dist/index.html` → **1**
  (только `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>`).
- После деплоя: `curl https://liga.skrebeyko.ru/ | grep crossorigin` →
  только preconnect.
- Реальный тест: следующая sync-ошибка в TG-мониторинге должна
  прилететь с конкретным `message`/`filename`/`lineno`/`stack`,
  а не «Script error.».

## Что проверить в будущем

- **При обновлении Vite** проверить, не изменился ли default
  поведения с crossorigin. Регулярка плагина — strict, при изменении
  HTML-формата может промазать.
- **Сигнал «Script error.»** в любом мониторинге window.onerror = с
  большой вероятностью CORS-маска. Не первая мысль — «упало в коде»;
  первая мысль — «проверь crossorigin attribute и ACAO header».
- **Default Vite-предположение, что bundle на отдельном CDN** — не
  всегда верное. Документировать это явно для будущих новых
  фронтенд-проектов: если у тебя same-origin static — снимай
  crossorigin сразу.
- **Не лечи симптом сервером, если фикс есть в build-стадии.** Серверная
  настройка (CORS header, redirect-rule) хрупкая (зависит от хостинга,
  чужой панели, прав), build-стадия в твоём контроле.

## История фиксов

- `(2026-05-11)` — попытка #1: .htaccess с ACAO header. **Не сработала**
  (nginx Timeweb игнорирует .htaccess).
- `(2026-05-15)` — попытка #2: Vite-плагин снимает crossorigin
  с same-origin тегов. Работает.
