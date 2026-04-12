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
await page.waitForTimeout(5000);

const navLibrary = page.getByRole('button', { name: 'Библиотека' });
if (await navLibrary.count()) {
    await navLibrary.first().click();
    await page.waitForTimeout(3500);
}

const bodyText = await page.locator('body').innerText();
const alCampVisible = /AL Camp|ПВЛ|Письменн/i.test(bodyText);
if (alCampVisible) {
    const candidates = ['AL Camp', 'ПВЛ', 'Письмен', 'Ai Camp', 'AI Camp'];
    for (const c of candidates) {
        const b = page.getByRole('button', { name: new RegExp(c, 'i') });
        if (await b.count()) {
            await b.first().click();
            await page.waitForTimeout(2000);
            break;
        }
    }
}

const state = await page.evaluate(() => ({
    url: location.href,
    title: document.title,
    sample: (document.body?.innerText || '').slice(0, 2000),
}));
console.log(JSON.stringify({ alCampVisible, state }, null, 2));
await page.screenshot({ path: `artifacts-enter-pvl-${Date.now()}.png`, fullPage: true });
await browser.close();
