import { chromium } from 'playwright';

const BASE_URL = 'https://liga.skrebeyko.ru/';
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
await page.waitForTimeout(6000);

const state = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button')).map((b) => (b.textContent || '').trim()).filter(Boolean);
    const menuTexts = Array.from(document.querySelectorAll('nav,aside,[role="navigation"] a, [role="navigation"] button'))
        .map((x) => (x.textContent || '').trim())
        .filter(Boolean)
        .slice(0, 60);
    return {
        title: document.title,
        url: location.href,
        bodySample: (document.body?.innerText || '').slice(0, 1600),
        buttons: buttons.slice(0, 80),
        menuTexts,
        hasStudent: document.body?.innerText?.includes('/student/') || document.body?.innerText?.includes('Учениц'),
    };
});

console.log(JSON.stringify(state, null, 2));
await page.screenshot({ path: `artifacts-login-${Date.now()}.png`, fullPage: true });
await browser.close();
