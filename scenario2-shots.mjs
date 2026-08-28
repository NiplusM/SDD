import { chromium } from 'playwright';
import { spawn } from 'node:child_process';

const PORT = 4805;
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

  // Open the "Chat History" tool window (left stripe icon).
  const historyStripe = page.locator('div.stripe[title="Chat History"]').first();
  await historyStripe.waitFor({ timeout: 10000 });
  await historyStripe.click();
  await page.waitForTimeout(500);

  // --- Step 1: the session's card in Chat History shows a "changes" section
  // accumulated across turns (refactor-time-slots is expanded by default).
  const changesSection = page.locator('.agent-sessions-changes[aria-label="Changed files"]').first();
  await changesSection.waitFor({ timeout: 10000 });
  await moveCursorTo(page, 250, 700);
  await page.waitForTimeout(200);
  await page.screenshot({ path: '/tmp/s2-step1-changes-section.png' });

  // --- Step 2: open review through this section — hover the file row before clicking.
  const fileRow = changesSection.locator('.aiux543-chat-tree-leaf-label', { hasText: 'VisitController.java' }).first();
  await fileRow.waitFor({ timeout: 10000 });
  const fileRowButton = fileRow.locator('xpath=ancestor::button[1]');
  await cursorToElement(page, fileRowButton, 100, 12);
  await page.waitForTimeout(200);
  await page.screenshot({ path: '/tmp/s2-step2-hover-file-row.png' });

  await fileRowButton.click();
  await page.waitForTimeout(900);

  // --- Step 3: the diff opens scoped to "Session Changes" (all turns), beside the chat.
  await moveCursorTo(page, 900, 750);
  await page.waitForTimeout(200);
  await page.screenshot({ path: '/tmp/s2-step3-diff-session-scope.png' });

  // --- Step 4: view the files, find the problem line — hover the gutter icon before clicking.
  const targetRow = page.locator('.plan-diff-row', { hasText: 'IntStream.rangeClosed(9, 16)' }).first();
  await targetRow.waitFor({ timeout: 10000 });
  const gutterIcon = targetRow.locator('[data-demo-id^="diff-comment-toggle-"]').first();
  await cursorToElement(page, gutterIcon, 8, 8);
  await page.waitForTimeout(200);
  await page.screenshot({ path: '/tmp/s2-step4-hover-gutter.png' });

  await gutterIcon.click();
  await page.waitForTimeout(400);

  // --- Step 5: leave a one-line comment on the line — hover "Add Note" before submitting.
  const noteInput = page.locator('[data-demo-id="diff-comment-input"]').first();
  await noteInput.waitFor({ timeout: 10000 });
  await noteInput.click();
  await noteInput.fill('Use named constants here.');
  await page.waitForTimeout(200);

  const addNoteBtn = page.locator('[data-demo-id="diff-comment-submit"]').first();
  await cursorToElement(page, addNoteBtn, 20, 12);
  await page.waitForTimeout(200);
  await page.screenshot({ path: '/tmp/s2-step5-hover-add-note.png' });

  await addNoteBtn.click();
  await page.waitForTimeout(600);

  // --- Step 6: the comment lands in the chat as context attached to the session.
  await moveCursorTo(page, 400, 700);
  await page.waitForTimeout(200);
  await page.screenshot({ path: '/tmp/s2-step6-note-attached.png' });

  // --- Step 7: send — the agent receives the comment. Hover "Send" before clicking.
  const sendBtn = page.locator('[aria-label="Send"]').first();
  await sendBtn.waitFor({ timeout: 10000 });
  await cursorToElement(page, sendBtn, 12, 12);
  await page.waitForTimeout(200);
  await page.screenshot({ path: '/tmp/s2-step7-hover-send.png' });

  await sendBtn.click();

  // --- Step 8: the agent returns a new iteration — the cycle repeats.
  await page.waitForTimeout(9000);
  await moveCursorTo(page, 400, 700);
  await page.screenshot({ path: '/tmp/s2-step8-new-iteration.png' });

  console.log('OK');
} finally {
  await browser.close();
  proc.kill();
}
