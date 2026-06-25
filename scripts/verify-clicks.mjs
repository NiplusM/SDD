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

console.log('Initial state (just entered IDE):');
const initialHistory = await page.locator('.aiux543-history-tool-window').count();
const initialAi = await page.locator('.ai-chat-window').count();
console.log({ historyToolWindow: initialHistory, aiChatWindow: initialAi });

const ai = async (label) => ({
  history: await page.locator('.aiux543-history-tool-window').count(),
  aiChat: await page.locator('.ai-chat-window').count(),
  centerTabs: await page.locator('[role="tab"][aria-selected="true"]').first().textContent().catch(()=>null),
});

console.log('--- 1) Project tool window: click spec row ---');
const visitProjectRow = page.locator('.aiux550-project-chat-row:has-text("Visit-Booking.md"):not(.aiux550-project-chat-row-nested)').first();
await visitProjectRow.click();
await page.waitForTimeout(500);
console.log('After click spec row:', JSON.stringify(await ai()));

console.log('--- 2) Project: click nested chat under Visit-Booking.md ---');
// Expand if not yet
const visitChevron = page.locator('.aiux550-project-chat-row:has-text("Visit-Booking.md"):not(.aiux550-project-chat-row-nested) .aiux550-project-chat-chevron button').first();
if (await visitChevron.getAttribute('aria-expanded') === 'false') {
  await visitChevron.click();
  await page.waitForTimeout(200);
}
const nestedChatProject = page.locator('.aiux550-project-chat-row-nested:has-text("Build:")').first();
await nestedChatProject.click();
await page.waitForTimeout(500);
console.log('After click nested chat:', JSON.stringify(await ai()));

console.log('--- 3) Chats History: click spec ---');
// First go back to history view if needed
const backBtn = page.locator('.ai-chat-back-button').first();
if (await backBtn.count()) {
  await backBtn.click();
  await page.waitForTimeout(300);
}
// Open New Session tab if not active
const newSessionTab = page.locator('[role="tab"]:has-text("New Session")').first();
if (await newSessionTab.count()) {
  await newSessionTab.click();
  await page.waitForTimeout(200);
}
const visitHistoryRow = page.locator('.aiux543-spec-node:has-text("Visit-Booking.md") > .aiux543-chat-row').first();
await visitHistoryRow.click();
await page.waitForTimeout(500);
console.log('After click spec row in history:', JSON.stringify(await ai()));

console.log('--- 4) Chats History: click nested chat ---');
const visitHistoryChevron = page.locator('.aiux543-spec-node:has-text("Visit-Booking.md") .aiux543-chat-row-chevron').first();
if (await visitHistoryChevron.getAttribute('aria-expanded') === 'false') {
  await visitHistoryChevron.click();
  await page.waitForTimeout(200);
}
const nestedHistory = page.locator('.aiux543-chat-row.aiux543-chat-row-nested:has-text("Build")').first();
if (await nestedHistory.count()) {
  await nestedHistory.click();
  await page.waitForTimeout(500);
  console.log('After click nested chat in history:', JSON.stringify(await ai()));
}

console.log('--- 5) Recent specs: click spec ---');
if (await backBtn.count()) {
  await backBtn.click();
  await page.waitForTimeout(300);
}
await newSessionTab.click().catch(()=>{});
await page.waitForTimeout(200);
const specModeBtn = page.locator('text="Spec Mode"').first();
if (await specModeBtn.count()) {
  await specModeBtn.click();
  await page.waitForTimeout(200);
}
const recentSpec = page.locator('.aiux550-recent-spec-row:has-text("Visit-Booking.md")').first();
if (await recentSpec.count()) {
  await recentSpec.click();
  await page.waitForTimeout(500);
  console.log('After click recent spec:', JSON.stringify(await ai()));
}

await browser.close();
