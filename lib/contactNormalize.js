/**
 * Helpers для нормализации и валидации контактов ведущей (TG/VK).
 *
 * Принимают свободный пользовательский ввод (`@user`, `t.me/x`, `vk.com/y`,
 * с/без протокола), приводят к каноническим ссылкам:
 *   TG  → https://t.me/<username>
 *   VK  → https://vk.me/<username>      (личка)
 *   VK  → https://vk.com/<id>           (если ввёл vk.com/id123 — оставляем)
 *
 * VK опционален — пустая строка считается валидной (см. isValidVk).
 *
 * Используется в:
 *   - services/dataService.js → updateUser (нормализация перед PATCH)
 *   - views/ProfileView.jsx   → handleSave (UX-валидация)
 */

export function normalizeTelegram(input) {
    if (!input) return '';
    let v = String(input).trim().replace(/^@+/, '');
    v = v.replace(/^https?:\/\//i, '');
    v = v.replace(/^telegram\.me\//i, 't.me/');
    if (!/^t\.me\//i.test(v)) v = 't.me/' + v;
    return 'https://' + v;
}

export function normalizeVk(input) {
    if (!input) return '';
    let v = String(input).trim().replace(/^@+/, '');
    v = v.replace(/^https?:\/\//i, '');
    // vk.com/write123 → vk.me/123
    v = v.replace(/^vk\.com\/write/i, 'vk.me/');
    // vk.com/<x> → vk.me/<x> для лички (если хост уже vk.me — оставляем)
    v = v.replace(/^vk\.com\//i, 'vk.me/');
    if (!/^vk\.(me|com)\//i.test(v)) v = 'vk.me/' + v;
    return 'https://' + v;
}

export const TG_RE = /^https:\/\/t\.me\/[A-Za-z0-9_+]{3,32}$/;
export const VK_RE = /^https:\/\/vk\.(me|com)\/[A-Za-z0-9_.-]{2,64}$/;

export function isValidTelegram(s) { return !!s && TG_RE.test(s); }
export function isValidVk(s)       { return !s || VK_RE.test(s); }
