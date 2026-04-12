import { chromium } from 'playwright';

const BASE_URL = 'https://liga.skrebeyko.ru/';
const API_BASE = 'https://api.skrebeyko.ru';
const email = process.env.PVL_EMAIL || '';
const password = process.env.PVL_PASSWORD || '';

if (!email || !password) {
    console.error('PVL_EMAIL and PVL_PASSWORD are required');
    process.exit(1);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.getByRole('button', { name: 'Войти' }).click();
await page.getByPlaceholder('Email').fill(email);
await page.getByPlaceholder('Пароль').fill(password);
await page.getByRole('button', { name: 'Войти' }).click();
await page.waitForTimeout(5000);

const probe = await page.evaluate(async ({ apiBase }) => {
    const token = localStorage.getItem('garden_auth_token') || '';
    const headers = {
        Authorization: token ? `Bearer ${token}` : '',
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'Accept-Profile': 'public',
        'Content-Profile': 'public',
    };
    const tables = [
        'pvl_content_items',
        'pvl_content_placements',
        'pvl_calendar_events',
        'pvl_faq_items',
        'pvl_student_questions',
        'pvl_audit_log',
        'pvl_student_course_progress',
        'pvl_student_homework_submissions',
        'pvl_homework_status_history',
    ];
    const out = [];
    for (const t of tables) {
        try {
            const r = await fetch(`${apiBase}/${t}?select=*&limit=1`, { headers });
            const txt = await r.text();
            out.push({ table: t, status: r.status, ok: r.ok, sample: txt.slice(0, 220) });
        } catch (e) {
            out.push({ table: t, status: 'ERR', ok: false, sample: String(e?.message || e) });
        }
    }
    return { hasToken: !!token, tokenPrefix: token.slice(0, 16), out };
}, { apiBase: API_BASE });

console.log(JSON.stringify(probe, null, 2));
await browser.close();
