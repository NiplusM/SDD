import { chromium } from 'playwright';
const URL = 'http://localhost:5173/AIUX-550/layout/';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await ctx.newPage();
page.on('pageerror', (err) => console.log('PAGEERR:', err.message));
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
await page.locator('button[aria-label="New AI session"]').first().click({ force: true });
await page.waitForTimeout(400);

console.log('Initial DOM state:');
const stripe = await page.evaluate(() => Array.from(document.querySelectorAll('.main-window-stripe-left [title]')).map(el => ({
  title: el.getAttribute('title'),
  selected: el.classList.contains('selected') || el.getAttribute('aria-selected') === 'true',
})));
console.log('Stripe icons:', JSON.stringify(stripe));
console.log('Left tool windows:', await page.locator('.main-window-tool-window-left').count());

// Click the Visit-Booking.md spec row
const target = page.locator('.aiux550-project-chat-row:has-text("Visit-Booking.md"):not(.aiux550-project-chat-row-nested)').first();
console.log('Target count:', await target.count());
const targetText = await target.textContent();
console.log('Target text:', targetText);
await target.click();
await page.waitForTimeout(500);

console.log('After click DOM state:');
const stripe2 = await page.evaluate(() => Array.from(document.querySelectorAll('.main-window-stripe-left [title]')).map(el => ({
  title: el.getAttribute('title'),
  selected: el.classList.contains('selected') || el.getAttribute('aria-selected') === 'true',
})));
console.log('Stripe icons:', JSON.stringify(stripe2));
const allLeftWindows = await page.evaluate(() => Array.from(document.querySelectorAll('.main-window-tool-window-left, .main-window-tool-window-right')).map(el => ({
  classes: el.className,
  title: el.querySelector('.tool-window-header-title, .tool-window-title')?.textContent ?? null,
})));
console.log('Tool windows:', JSON.stringify(allLeftWindows));
const visible = await page.locator('.ai-chat-window').isVisible().catch(() => false);
console.log('ai-chat-window isVisible:', visible);
const rect = await page.locator('.ai-chat-window').boundingBox().catch(() => null);
console.log('ai-chat-window rect:', rect);
const tabs = await page.locator('[role="tab"]').allTextContents();
console.log('Editor tabs:', tabs);
const activeTab = await page.locator('[role="tab"][aria-selected="true"]').first().textContent().catch(() => null);
console.log('Active tab:', activeTab);

await page.screenshot({ path: '/tmp/debug-after-click.png' });

await browser.close();
