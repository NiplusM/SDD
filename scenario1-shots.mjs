import { chromium } from 'playwright';
import { spawn } from 'node:child_process';

const PORT = 4804;
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

// Injects a fake visible cursor (Playwright doesn't render the OS cursor in
// screenshots) and keeps it in sync with real mouse moves so :hover states
// are genuinely triggered, not just visually implied.
async function injectFakeCursor(page) {
  await page.evaluate(() => {
    if (document.getElementById('__fake_cursor__')) return;
    const el = document.createElement('div');
    el.id = '__fake_cursor__';
    el.style.position = 'fixed';
    el.style.top = '0';
    el.style.left = '0';
    el.style.width = '24px';
    el.style.height = '24px';
    el.style.zIndex = '2147483647';
    el.style.pointerEvents = 'none';
    el.style.transform = 'translate(-2px, -2px)';
    el.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M4 2 L4 20 L9 15.5 L12.5 21.5 L15 20 L11.5 14 L19 14 Z" fill="white" stroke="black" stroke-width="1.2" stroke-linejoin="round"/>
    </svg>`;
    document.body.appendChild(el);
  });
}

async function moveCursorTo(page, x, y, steps = 15) {
  await page.mouse.move(x, y, { steps });
  await page.evaluate(({ x, y }) => {
    const el = document.getElementById('__fake_cursor__');
    if (el) { el.style.left = `${x}px`; el.style.top = `${y}px`; }
  }, { x, y });
}

async function cursorToElement(page, locator, offsetX = 8, offsetY = 8) {
  const box = await locator.boundingBox();
  if (!box) throw new Error('element not found for cursor move');
  await moveCursorTo(page, box.x + offsetX, box.y + offsetY);
  return box;
}

await waitReady();
await new Promise((r) => setTimeout(r, 500));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });

try {
  await page.goto(`http://localhost:${PORT}/`);
  await page.waitForTimeout(1000);
  await injectFakeCursor(page);

  const input = page.locator('.aiux543-chat-input, textarea, [contenteditable="true"]').first();
  await input.waitFor({ timeout: 10000 });
  await input.click();
  await input.fill('Can you also update VisitControllerTests.java to cover the new constructor-based initialization?');
  await page.keyboard.press('Enter');

  // --- Step 1: while the agent works, files reveal one at a time; once the run finishes,
  // they collect into the "N files changed" block under the agent's reply.
  const reviewBtn = page.locator('.ai-chat-edited-files-review-link').first();
  await reviewBtn.waitFor({ timeout: 15000 });
  await page.waitForTimeout(300);
  await moveCursorTo(page, 900, 750);
  await page.screenshot({ path: '/tmp/s1-step1-files-collected.png' });

  // --- Step 2: open the review from that block — hover "Review" before clicking.
  await cursorToElement(page, reviewBtn, 20, 10);
  await page.waitForTimeout(200);
  await page.screenshot({ path: '/tmp/s1-step2-hover-review.png' });

  await reviewBtn.click();
  await page.waitForTimeout(900);

  // --- Step 3: diff opens beside the chat, scoped to "Last Turn".
  await moveCursorTo(page, 900, 750);
  await page.screenshot({ path: '/tmp/s1-step3-diff-open.png' });

  // --- Step 4: view the files, find the problem line — hover the gutter icon before clicking.
  const targetRow = page.locator('.plan-diff-row', { hasText: 'IntStream.rangeClosed(9, 16)' }).first();
  await targetRow.waitFor({ timeout: 10000 });
  const gutterIcon = targetRow.locator('[data-demo-id^="diff-comment-toggle-"]').first();
  await cursorToElement(page, gutterIcon, 8, 8);
  await page.waitForTimeout(200);
  await page.screenshot({ path: '/tmp/s1-step4-hover-gutter.png' });

  await gutterIcon.click();
  await page.waitForTimeout(400);

  // --- Step 5: leave a comment on the line — one-line note, hover "Add Note" before submitting.
  const noteInput = page.locator('[data-demo-id="diff-comment-input"]').first();
  await noteInput.waitFor({ timeout: 10000 });
  await noteInput.click();
  await noteInput.fill('Use named constants here.');
  await page.waitForTimeout(200);

  const addNoteBtn = page.locator('[data-demo-id="diff-comment-submit"]').first();
  await cursorToElement(page, addNoteBtn, 20, 12);
  await page.waitForTimeout(200);
  await page.screenshot({ path: '/tmp/s1-step5-hover-add-note.png' });

  await addNoteBtn.click();
  await page.waitForTimeout(600);

  // --- Step 6: the comment lands in the chat as context attached to the message.
  await moveCursorTo(page, 400, 700);
  await page.screenshot({ path: '/tmp/s1-step6-note-attached.png' });

  // --- Step 7: send — the agent receives the comment. Hover "Send" before clicking.
  const sendBtn = page.locator('[aria-label="Send"]').first();
  await sendBtn.waitFor({ timeout: 10000 });
  await cursorToElement(page, sendBtn, 12, 12);
  await page.waitForTimeout(200);
  await page.screenshot({ path: '/tmp/s1-step7-hover-send.png' });

  await sendBtn.click();

  // --- Step 8: the agent returns a new iteration — the cycle repeats.
  const newReviewBtn = page.locator('.ai-chat-edited-files-review-link').first();
  await newReviewBtn.waitFor({ timeout: 15000 });
  await page.waitForTimeout(5000);
  await moveCursorTo(page, 400, 700);
  await page.screenshot({ path: '/tmp/s1-step8-new-iteration.png' });

  console.log('OK');
} finally {
  await browser.close();
  proc.kill();
}
