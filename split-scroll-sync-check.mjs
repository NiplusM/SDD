// Verifies "Synchronize Scrolling" and "Align Changes in Side-by-Side Diff",
// which no screenshot can capture. The decisive case is the last one: with
// alignment off the halves hold different rows, so a correct implementation
// parks them at *different* scroll offsets with the *same* logical line at the
// top. A shared scroller could never produce that.
//
//   1 aligned,   sync ON,  drive left  -> both follow
//   2 aligned,   sync ON,  drive right -> both follow (either direction)
//   3 aligned,   sync OFF, drive right -> halves stay independent
//   4 unaligned, sync ON,  drive left  -> different offsets, same line on top
//
// Run: node split-scroll-sync-check.mjs
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
const PORT = 4837;
const proc = spawn('npm', ['run', 'preview', '--', '--port', String(PORT)], { cwd: process.cwd() });
let ready = false;
proc.stdout.on('data', (d) => { if (d.toString().includes('Local:')) ready = true; });
for (let i = 0; i < 100 && !ready; i++) await new Promise(r => setTimeout(r, 150));
await new Promise(r => setTimeout(r, 600));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
const info = () => page.evaluate(() => {
  const l = document.querySelector('.plan-diff-split-pane-left');
  const r = document.querySelector('.plan-diff-split-pane-right');
  const topRow = (p) => {
    const rows = Array.from(p.querySelectorAll('[data-plan-diff-row-id]'));
    const pt = p.getBoundingClientRect().top;
    const hit = rows.find((el) => el.getBoundingClientRect().top - pt >= -2);
    return hit ? ((hit.innerText || '').split('\n').pop().trim().slice(0, 30) || '(blank)') : null;
  };
  return { L: Math.round(l.scrollTop), R: Math.round(r.scrollTop), topL: topRow(l), topR: topRow(r) };
});
const scroll = (v) => page.evaluate((val) => {
  document.querySelector('.plan-diff-split-pane-left').scrollTop = val;
}, v);
const scrollRight = (v) => page.evaluate((val) => {
  document.querySelector('.plan-diff-split-pane-right').scrollTop = val;
}, v);
const menu = async (label) => {
  await page.locator('.plan-diff-settings-trigger button').first().click();
  await page.waitForTimeout(400);
  await page.locator('.popup-cell', { hasText: label }).first().click();
  await page.waitForTimeout(300);
  await page.mouse.click(300, 930);
  await page.waitForTimeout(500);
};
try {
  await page.goto(`http://localhost:${PORT}/`);
  await page.waitForTimeout(1000);
  const input = page.locator('.aiux543-chat-input, textarea, [contenteditable="true"]').first();
  await input.click(); await input.fill('go'); await page.keyboard.press('Enter');
  const rev = page.locator('.ai-chat-edited-files-review-link').first();
  await rev.waitFor({ timeout: 20000 }); await rev.click(); await page.waitForTimeout(1200);
  // The IDE shell is taller than the window, so a short viewport would not
  // shrink the diff area — cap the panes to force the overflow a longer file
  // produces in real use, and exercise the mapping itself.
  await page.addStyleTag({ content: '.plan-diff-overlay--split .plan-diff-split-pane { max-height: 220px; }' });
  await page.locator('.plan-diff-toolbar-viewtoggle button').first().click();
  await page.waitForTimeout(800);

  await scroll(150); await page.waitForTimeout(400);
  console.log('1 aligned, sync ON,  drive L ->', JSON.stringify(await info()));

  await scroll(0); await scrollRight(0); await page.waitForTimeout(250);
  await scrollRight(150); await page.waitForTimeout(400);
  console.log('2 aligned, sync ON,  drive R ->', JSON.stringify(await info()));

  await menu('Synchronize Scrolling');
  await scroll(0); await scrollRight(0); await page.waitForTimeout(250);
  await scrollRight(150); await page.waitForTimeout(400);
  console.log('3 aligned, sync OFF, drive R ->', JSON.stringify(await info()));

  await menu('Synchronize Scrolling');
  await menu('Align Changes in Side-by-Side Diff');
  await scroll(0); await scrollRight(0); await page.waitForTimeout(250);
  await scroll(20); await page.waitForTimeout(400);
  console.log('4 unaligned, sync ON, drive L ->', JSON.stringify(await info()));

  console.log('OK');
} finally { await browser.close(); proc.kill(); }
