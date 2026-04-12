import { chromium } from 'playwright';

const BASE_URL = 'https://liga.skrebeyko.ru/';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(2500);

const meta = await page.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll('input, textarea, select')).map((el) => ({
        tag: el.tagName.toLowerCase(),
        type: el.getAttribute('type') || '',
        name: el.getAttribute('name') || '',
        id: el.getAttribute('id') || '',
        placeholder: el.getAttribute('placeholder') || '',
        aria: el.getAttribute('aria-label') || '',
    }));
    const buttons = Array.from(document.querySelectorAll('button')).map((b) => (b.textContent || '').trim()).filter(Boolean);
    const links = Array.from(document.querySelectorAll('a')).map((a) => (a.textContent || '').trim()).filter(Boolean);
    return {
        title: document.title,
        url: location.href,
        inputs,
        buttons: buttons.slice(0, 40),
        links: links.slice(0, 40),
        textSample: (document.body?.innerText || '').slice(0, 1200),
    };
});

console.log(JSON.stringify(meta, null, 2));
await browser.close();
