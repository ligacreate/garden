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
await page.waitForTimeout(4000);
const openAppBtn = page.getByRole('button', { name: 'Открыть приложение' });
if (await openAppBtn.count()) {
    await openAppBtn.first().click();
    await page.waitForTimeout(4000);
}
await page.getByRole('button', { name: 'Библиотека' }).first().click();
await page.waitForTimeout(2500);

const pvlTitle = page.locator('text=Пиши. Веди. Люби.').first();
if (await pvlTitle.count()) {
    const card = pvlTitle.locator('xpath=ancestor::*[self::article or self::section or self::div][1]');
    const openBtn = card.getByRole('button', { name: 'Открыть' }).first();
    if (await openBtn.count()) {
        await openBtn.click();
        await page.waitForTimeout(4000);
    } else {
        // fallback: click title itself if button hierarchy differs
        await pvlTitle.click();
        await page.waitForTimeout(4000);
    }
}

const snapshot = await page.evaluate(() => {
    const txt = document.body?.innerText || '';
    const inputs = Array.from(document.querySelectorAll('input')).map((i) => i.placeholder || i.type || 'input');
    const buttons = Array.from(document.querySelectorAll('button')).map((b) => (b.textContent || '').trim()).filter(Boolean).slice(0, 50);
    return {
        url: location.href,
        title: document.title,
        hasPin: /pin|код/i.test(txt),
        hasPvlRoutes: /\/student\/|\/mentor\/|\/admin\/pvl/i.test(txt),
        inputs,
        buttons,
        sample: txt.slice(0, 2400),
    };
});

console.log(JSON.stringify(snapshot, null, 2));
await page.screenshot({ path: `artifacts-open-course-${Date.now()}.png`, fullPage: true });
await browser.close();
