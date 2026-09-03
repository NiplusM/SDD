// Walks the "viewed / not viewed" review-progress flow and captures a shot at
// every state: all files unreviewed, one marked viewed, the row context menu,
// the fully-reviewed list, and the reset back to not viewed after the agent
// rewrites a commented file. Same conventions as scenario1-shots.mjs.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';

const PORT = 4809;
const OUT = '/tmp/viewed';
const proc = spawn('npm', ['run', 'preview', '--', '--port', String(PORT)], { cwd: process.cwd() });
let ready = false;
proc.stdout.on('data', (d) => { if (d.toString().includes('Local:')) ready = true; });
proc.stderr.on('data', () => {});

async function waitReady() {
  for (let i = 0; i < 100; i++) {
    if (ready) return;
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('server not ready');
}

await waitReady();
await new Promise((r) => setTimeout(r, 500));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });

// The files popup portals to document.body, so clip to its own box rather than
// to the toolbar that opened it.
const popup = () => page.locator('.plan-diff-files-popup').first();
const shotPopup = async (name) => {
  // Park the cursor off the popup first: a resting mouse leaves a hover state
  // in the shot that reads as a real style rather than a transient one.
  await page.mouse.move(60, 520);
  await page.waitForTimeout(250);
  const box = await popup().boundingBox();
  if (!box) throw new Error(`popup not visible for ${name}`);
  await page.screenshot({
    path: `${OUT}-${name}.png`,
    clip: { x: box.x - 8, y: box.y - 8, width: box.width + 16, height: box.height + 16 },
  });
};
const openFilesPopup = async () => {
  const trigger = page.locator('.plan-diff-viewing-file-count-link').first();
  await trigger.waitFor({ timeout: 10000 });
  if (!(await popup().isVisible().catch(() => false))) await trigger.click();
  await popup().waitFor({ timeout: 10000 });
};
// Escape does not dismiss these popups, and their dismiss backdrop covers the
// whole viewport (including the trigger), so a targeted click is intercepted.
// Dispatch a raw click at a neutral point instead — the backdrop absorbs it and
// runs onDismiss, which is exactly the outside-click path a user takes.
const dismissPopups = async () => {
  for (let i = 0; i < 3; i++) {
    if (!(await popup().isVisible().catch(() => false))) break;
    await page.mouse.click(1560, 970);
    await page.waitForTimeout(250);
  }
  await page.waitForTimeout(250);
};

try {
  await page.goto(`http://localhost:${PORT}/`);
  await page.waitForTimeout(1000);

  const input = page.locator('.aiux543-chat-input, textarea, [contenteditable="true"]').first();
  await input.waitFor({ timeout: 10000 });
  await input.click();
  await input.fill('Can you also update VisitControllerTests.java to cover the new constructor-based initialization?');
  await page.keyboard.press('Enter');

  const reviewBtn = page.locator('.ai-chat-edited-files-review-link').first();
  await reviewBtn.waitFor({ timeout: 20000 });
  await reviewBtn.click();
  await page.waitForTimeout(900);

  // --- 1: every file starts not viewed — blue dot per row, "0/N viewed".
  await openFilesPopup();
  await shotPopup('1-all-unviewed');

  const rows = page.locator('.plan-diff-files-file-row');
  const rowCount = await rows.count();

  // --- 2: click the dot on the first row -> checkmark, counter ticks up,
  // popup stays open (the toggle must not select the file).
  await rows.nth(0).locator('.plan-diff-files-file-viewed').click();
  await shotPopup('2-one-viewed');

  // --- 3: mark all but the last, so the counter and the "next not viewed"
  // action are both visible in a partially-reviewed list.
  for (let i = 1; i < rowCount - 1; i++) {
    await rows.nth(i).locator('.plan-diff-files-file-viewed').click();
    await page.waitForTimeout(80);
  }
  await shotPopup('3-partial');

  // --- 4: right-click a viewed row -> "Mark as Not Viewed".
  await rows.nth(0).click({ button: 'right' });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}-4-context-menu.png` });

  await page.mouse.click(1560, 970);
  await page.waitForTimeout(300);

  // --- 5: everything viewed -> counter turns green with a checkmark and the
  // "next not viewed" action is disabled.
  await openFilesPopup();
  const remaining = page.locator('.plan-diff-files-file-row:not(.is-viewed) .plan-diff-files-file-viewed');
  while (await remaining.count()) {
    await remaining.first().click();
    await page.waitForTimeout(80);
  }
  await shotPopup('5-all-viewed');
  await dismissPopups();

  // --- 6: comment on a line and send it, so the agent runs another iteration.
  const targetRow = page.locator('.plan-diff-row', { hasText: 'IntStream.rangeClosed(9, 16)' }).first();
  await targetRow.waitFor({ timeout: 10000 });
  await targetRow.locator('[data-demo-id^="diff-comment-toggle-"]').first().click();
  await page.waitForTimeout(400);
  const noteInput = page.locator('[data-demo-id="diff-comment-input"]').first();
  await noteInput.waitFor({ timeout: 10000 });
  await noteInput.click();
  await noteInput.fill('Use named constants here.');
  await page.locator('[data-demo-id="diff-comment-submit"]').first().click();
  await page.waitForTimeout(600);
  await page.locator('[aria-label="Send"]').first().click();

  // --- 7: after the agent's new iteration the commented file is not viewed
  // again, while the files it did not touch keep their viewed marks.
  await page.waitForTimeout(14000);
  await openFilesPopup();
  await shotPopup('7-reset-after-agent');

  // --- 8: the review pane header's More menu carries the same action.
  await dismissPopups();
  await page.locator('.ai-review-editor-split-pane.is-review .editor-tabs-more-button').first().click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}-8-more-menu.png` });
  await page.mouse.click(760, 970);
  await page.waitForTimeout(300);

  // --- 9: a wider change scope pulls in the other sessions' files, which is
  // where Deleted and Renamed statuses live in the demo data. The kit's
  // PopupCell drops className, so the options are matched by their text.
  await page.locator('.plan-diff-change-scope-button').first().click();
  await page.waitForTimeout(500);
  await page.locator('.popup-cell', { hasText: 'All Changes' }).first().click();
  await page.waitForTimeout(900);
  await openFilesPopup();
  await shotPopup('9-wide-scope-statuses');

  // --- 10: scroll the tree down to the resources branch, where the demo data
  // holds the deleted (legacy-visits.sql) and renamed (ownerProfile.html) files.
  await page.locator('.plan-diff-files-tree').first().evaluate((el) => { el.scrollTop = el.scrollHeight; });
  await shotPopup('10-renamed');

  // --- 11: and the deleted file, in the resources branch.
  await page.locator('.plan-diff-files-file-row', { hasText: 'legacy-visits.sql' })
    .first().scrollIntoViewIfNeeded();
  await shotPopup('11-deleted');

  console.log('OK');
} finally {
  await browser.close();
  proc.kill();
}
