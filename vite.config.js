import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// MON-001 — стабильный per-build идентификатор. Прокидывается в
// frontend через `__BUILD_ID__` (см. utils/clientErrorReporter.js).
// Это позволяет различать «новая ошибка после деплоя» vs «зомби-bundle».
const BUILD_ID = process.env.GITHUB_SHA
  || process.env.BUILD_ID
  || `${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)}`;

// BUG-CORS-SCRIPT-ERROR fix — снимаем crossorigin с same-origin asset-тегов.
//
// Проблема: Vite по умолчанию ставит crossorigin="anonymous" на
//   <script type="module">, <link rel="modulepreload">,
//   <link rel="stylesheet"> (для CSS-чанков).
// Атрибут переводит загрузку даже same-origin ресурсов в CORS-режим.
// Если сервер не отдаёт Access-Control-Allow-Origin (наш nginx Timeweb
// не отдаёт — попытка через .htaccess не сработала, .htaccess не читается),
// браузер маркирует JS как opaque, и любая sync-ошибка попадает в
// window.onerror как «Script error.» без message/filename/lineno/stack.
// Это маскирует ~70% ошибок в TG-мониторинге (MON-002).
//
// Решение: убираем crossorigin только у тегов со src/href="/..." (relative
// = same-origin). Внешние ресурсы (fonts.gstatic.com — preconnect)
// сохраняют crossorigin — он там нужен для CORS prefetch шрифтов.
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

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), removeCrossoriginSameOrigin()],
  base: '/', // Absolute path for root deployment
  define: {
    __BUILD_ID__: JSON.stringify(BUILD_ID),
  },
  server: {
    // Иначе на Windows Vite часто слушает только [::1], а localhost уходит на 127.0.0.1 — страница не открывается
    host: true,
    port: 5173,
  },
})
